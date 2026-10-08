import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Phục vụ tệp tĩnh trong public/. Danh sách tệp được quét một lần lúc khởi động và chỉ trả đúng các tệp đó
// (không ghép đường dẫn từ URL), nên không thể truy cập ra ngoài public/.
const publicDir = join(dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function scan(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await scan(full));
    else if (TYPES[extname(entry.name)]) out.push(full);
  }
  return out;
}

const files = new Map();
for (const full of await scan(publicDir)) files.set('/' + relative(publicDir, full).split(sep).join('/'), full);
files.set('/', files.get('/dashboard.html'));

createServer(async (req, res) => {
  const file = files.get(new URL(req.url || '/', 'http://localhost').pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)], 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Cannot read page'); }
}).listen(Number(process.env.PORT ?? 4000), () => console.log('Web listening on http://localhost:4000'));
