// Máy chủ tĩnh tối giản cho trang dashboard (không phụ thuộc thư viện nào).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const rel = normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
  // Chặn thoát khỏi thư mục (../) và không phục vụ mã server.
  if (rel.startsWith('..') || rel === 'server.mjs' || rel === 'package.json') {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(PORT, () => console.log(`web listening on :${PORT}`));
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
