import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Tra log của các service theo requestId, cho trang order-compare.html (chỉ dùng khi demo).
// Chỉ đọc các tệp *.log nằm trực tiếp trong thư mục log; tên tệp lấy từ readdir, không ghép từ URL.
// requestId phải khớp mẫu bên dưới nên không thể mang ký tự đường dẫn.
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

export async function findLogs(dir, requestId) {
  if (!REQUEST_ID_PATTERN.test(requestId)) return null;
  let names;
  try { names = (await readdir(dir)).filter((n) => n.endsWith('.log')).sort(); } catch { return []; }
  const entries = [];
  for (const name of names) {
    let text;
    try { text = await readFile(join(dir, name), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.includes(requestId)) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.requestId === requestId) entries.push({ file: name.replace(/\.log$/, ''), ...entry });
      } catch { /* dòng không phải JSON: bỏ qua */ }
    }
  }
  return entries.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
