#!/usr/bin/env python3
"""Chuyển một tệp Markdown thành HTML một tệp (nút sáng/tối, bảng, danh sách, đoạn mã, ảnh, sơ đồ Mermaid).
Chạy: python3 build-html.py <vào.md> <ra.html> "<tiêu đề trang>" ["<ghi chú dưới tiêu đề>"]
Ví dụ: python3 build-html.py REPORT.md REPORT.html "Báo cáo Block 2" """
import html, re
from pathlib import Path

import sys
if len(sys.argv) < 4:
    sys.exit(__doc__)
SRC, DST, TITLE = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
NOTE = sys.argv[4] if len(sys.argv) > 4 else ''
md = SRC.read_text(encoding='utf8')

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'!\[([^\]]*)\]\(([^)\s]+)\)', r'<img src="\2" alt="\1" loading="lazy">', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', r'<a href="\2">\1</a>', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    return t

def table(rows):
    cells = lambda r: [c.strip() for c in r.strip().strip('|').split('|')]
    head = cells(rows[0]); body = [cells(r) for r in rows[2:]]
    h = '<table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
    for r in body:
        h += '<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>'
    return h + '</tbody></table>'

def convert(lines):
    out, i = [], 0
    para = []
    def flush():
        nonlocal para
        if para: out.append(f'<p>{inline(" ".join(para))}</p>'); para = []
    while i < len(lines):
        ln = lines[i]
        if ln.startswith('```'):
            flush(); lang = ln[3:].strip(); i += 1; buf = []
            while i < len(lines) and not lines[i].startswith('```'): buf.append(lines[i]); i += 1
            code = '\n'.join(buf)
            if lang == 'mermaid': out.append(f'<pre class="mermaid">{html.escape(code, quote=False)}</pre>')
            else: out.append(f'<pre class="code"><code>{html.escape(code, quote=False)}</code></pre>')
        elif ln.startswith('#### '): flush(); out.append(f'<h4>{inline(ln[5:])}</h4>')
        elif ln.startswith('### '): flush(); out.append(f'<h3>{inline(ln[4:])}</h3>')
        elif ln.startswith('|'):
            flush(); rows = []
            while i < len(lines) and lines[i].startswith('|'): rows.append(lines[i]); i += 1
            i -= 1; out.append(table(rows))
        elif ln.startswith('- '):
            flush(); items = []
            while i < len(lines) and lines[i].startswith('- '): items.append(lines[i][2:]); i += 1
            i -= 1; out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>')
        elif re.match(r'\d+\. ', ln):
            flush(); items = []
            while i < len(lines) and re.match(r'\d+\. ', lines[i]): items.append(re.sub(r'^\d+\. ', '', lines[i])); i += 1
            i -= 1; out.append('<ol>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ol>')
        elif ln.startswith('> '): flush(); out.append(f'<blockquote>{inline(ln[2:])}</blockquote>')
        elif not ln.strip(): flush()
        else: para.append(ln.strip())
        i += 1
    flush()
    return '\n'.join(out)

parts = re.split(r'\n(?=## )', md)
intro = [l for l in parts[0].split('\n') if not l.startswith('# ')]
sections = []
for s in parts[1:]:
    lines = s.split('\n')
    sections.append(f'<section><h2>{inline(lines[0][3:].strip())}</h2>\n{convert(lines[1:])}\n</section>')

page = f'''<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(TITLE)}</title>
<style>
:root{{color-scheme:light;--bg:#fff;--fg:#1a1a1a;--line:#d0d0d0;--card:#fafafa;--code:#f1f1f1}}
:root[data-theme="dark"]{{color-scheme:dark;--bg:#16181d;--fg:#e8e8e8;--line:#3a3d44;--card:#1e2128;--code:#12141a}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,sans-serif}}
main{{max-width:1100px;margin:0 auto;padding:1.5rem}}
h1{{margin:.2rem 0 1rem}}
section{{margin:0 0 2rem;padding:1rem 1.25rem;border:1px solid var(--line);border-radius:10px;background:var(--card)}}
h2{{margin:.2rem 0 .75rem;font-size:1.25rem}}
h3{{margin:1.25rem 0 .5rem;font-size:1.05rem}}
h4{{margin:1rem 0 .4rem;font-size:1rem}}
img{{max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px}}
a{{color:inherit}}
ol,ul{{padding-left:1.4rem}}
.mermaid{{background:transparent;text-align:center;overflow-x:auto}}
code{{background:rgba(128,128,128,.18);padding:0 .25em;border-radius:4px}}
pre.code{{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:.75rem 1rem;overflow-x:auto}}
pre.code code{{background:none;padding:0;font:14px/1.5 ui-monospace,Consolas,monospace}}
table{{border-collapse:collapse;width:100%;margin:.5rem 0;font-size:.95rem}}
th,td{{border:1px solid var(--line);padding:.4rem .6rem;text-align:left;vertical-align:top}}
th{{background:rgba(128,128,128,.12)}}
blockquote{{margin:.5rem 0;padding:.4rem .9rem;border-left:4px solid var(--line);opacity:.85}}
.note{{opacity:.75;font-size:.9rem}}
#theme-toggle{{position:fixed;top:.75rem;right:.75rem;z-index:10;padding:.4rem .8rem;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit;cursor:pointer}}
#theme-toggle:hover{{border-color:var(--fg)}}
</style></head>
<body><button id="theme-toggle" type="button" aria-pressed="false">Chế độ tối</button><main>
<h1>{html.escape(TITLE)}</h1>
<p class="note">{html.escape(NOTE)}</p>
{chr(10).join(sections)}
</main>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
const root = document.documentElement;
const btn = document.getElementById('theme-toggle');
const store = {{
  get() {{ try {{ return localStorage.getItem('theme'); }} catch {{ return null; }} }},
  set(v) {{ try {{ localStorage.setItem('theme', v); }} catch {{ /* bỏ qua nếu bị chặn */ }} }},
}};
let theme = store.get() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const nodes = [...document.querySelectorAll('.mermaid')];
const sources = nodes.map((n) => n.textContent);

function apply() {{
  root.dataset.theme = theme;
  btn.textContent = theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối';
  btn.setAttribute('aria-pressed', String(theme === 'dark'));
}}
async function render() {{
  mermaid.initialize({{ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'strict', sequence: {{ mirrorActors: false, useMaxWidth: true }} }});
  nodes.forEach((n, i) => {{ n.removeAttribute('data-processed'); n.textContent = sources[i]; }});
  await mermaid.run({{ nodes }});
}}
btn.addEventListener('click', async () => {{
  theme = theme === 'dark' ? 'light' : 'dark';
  store.set(theme);
  apply();
  await render();
}});
apply();
await render();
</script>
</body></html>
'''
DST.write_text(page, encoding='utf8')
print(f'đã ghi {DST}: {len(sections)} mục, {page.count(chr(34)+"mermaid"+chr(34))} sơ đồ, {page.count("<table>")} bảng, {page.count("pre class=")-page.count("pre class=\"mermaid")} khối mã')
