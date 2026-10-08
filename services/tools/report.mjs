// Tạo bảng đo thô dạng đọc được từ results/raw: results/evidence/measurements.md
// Dùng: node tools/report.mjs [thư-mục-raw]   (bỏ qua bản ghi testAdapter)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const rawDir = resolve(process.argv[2] ?? join(repo, 'results/raw'));
const all = readdirSync(rawDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(rawDir, f), 'utf8')));
const rows = all.filter((r) => !r.testAdapter);
const skipped = all.length - rows.length;
const names = ['user', 'order', 'product', 'bff', 'graphql'];
const VARIANTS = ['baseline', 'bff', 'graphql-naive', 'graphql-fixed'];
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const rng = (a) => `${Math.min(...a)}–${Math.max(...a)}`;
// Giá trị không đổi giữa các lần chạy thì in một số; có dao động thì in median [min–max].
const fmt = (a) => (!a.length ? '—' : Math.round(Math.min(...a)) === Math.round(Math.max(...a)) ? String(Math.round(med(a))) : `${Math.round(med(a))} [${Math.round(Math.min(...a))}–${Math.round(Math.max(...a))}]`);

let md = `# Bảng đo thô (từ \`${rawDir.replace(repo + '/', '')}\`)

Tạo bởi \`node services/tools/report.mjs\`. Mỗi ô ấm là **median [min–max]** của các lần chạy ấm; lần lạnh báo riêng. ${rows.length} bản ghi${skipped ? `, bỏ qua ${skipped} bản ghi testAdapter` : ''}.

## Cách đếm
- **Request client** và **payload**: hàm bọc \`fetch\` trong trang đếm các lời gọi tới cổng 4001–4005, không tính \`/health\`, \`/_metrics\`, \`/_fault\`, tệp tĩnh; payload là tổng byte thân phản hồi (nén tắt). Ảnh thumbnail không được tải (chỉ là chuỗi).
- **Service call / DB query của từng service**: \`/_metrics\` của service, reset trước mỗi lần chạy, đọc sau khi xong. BFF và GraphQL chỉ báo \`requests\` (không có DB).
- **Thời gian hoàn tất**: từ lúc bắt đầu tải đến sau lần cập nhật DOM cuối (mọi đơn đã hiển thị đủ tên product), \`performance.mark('screen-complete')\`. Không gồm thời gian reset/đọc metrics/lưu kết quả.
- **Lạnh**: lần chạy đầu sau khi khởi động lại các service (không khởi động lại Postgres); **ấm**: các lần sau trong cùng phiên.

`;
for (const size of ['S', 'L']) for (const client of ['web', 'mobile']) {
  const group = rows.filter((r) => r.size === size && r.client === client);
  if (!group.length) continue;
  md += `## Dữ liệu ${size} · client ${client}\n\n| Biến thể | Lạnh: ms / req / byte | Ấm: ms | Ấm: request client | Ấm: byte | ${['user', 'order', 'product'].map((n) => `${n} req/DB`).join(' | ')} | bff req | graphql req | Lần ấm | Một phần |\n|---|---|---|---|---|${'---|'.repeat(7)}\n`;
  for (const v of VARIANTS) {
    const g = group.filter((r) => r.variant === v), warm = g.filter((r) => r.mode === 'warm'), cold = g.find((r) => r.mode === 'cold');
    if (!g.length) { md += `| ${v} | (chưa đo) |||||||||||\n`; continue; }
    const svc = (n, f) => fmt(warm.map((r) => r.services[n][f]));
    md += `| ${v} | ${cold ? `${Math.round(cold.completeMs)} / ${cold.clientRequests} / ${cold.payloadBytes}` : '—'} | ${fmt(warm.map((r) => r.completeMs))} | ${fmt(warm.map((r) => r.clientRequests))} | ${fmt(warm.map((r) => r.payloadBytes))} | ${['user', 'order', 'product'].map((n) => `${svc(n, 'requests')} / ${svc(n, 'dbQueries')}`).join(' | ')} | ${svc('bff', 'requests')} | ${svc('graphql', 'requests')} | ${warm.length} | ${g.filter((r) => r.partial).length} |\n`;
  }
  md += '\n';
}
md += `## Từng lần chạy (thô)\n\n| Cấu hình | Chế độ | Lần | ms | Request client | Byte | Một phần | user req/DB | order req/DB | product req/DB | bff req | graphql req |\n|---|---|---:|---:|---:|---:|---|---|---|---|---:|---:|\n`;
for (const r of [...rows].sort((a, b) => `${a.size}${a.client}${VARIANTS.indexOf(a.variant)}${a.mode === 'cold' ? 0 : 1}${a.run}`.localeCompare(`${b.size}${b.client}${VARIANTS.indexOf(b.variant)}${b.mode === 'cold' ? 0 : 1}${b.run}`))) {
  md += `| ${r.size}/${r.client}/${r.variant} | ${r.mode === 'cold' ? 'lạnh' : 'ấm'} | ${r.run} | ${Math.round(r.completeMs)} | ${r.clientRequests} | ${r.payloadBytes} | ${r.partial ? 'có' : 'không'} | ${r.services.user.requests}/${r.services.user.dbQueries} | ${r.services.order.requests}/${r.services.order.dbQueries} | ${r.services.product.requests}/${r.services.product.dbQueries} | ${r.services.bff.requests} | ${r.services.graphql.requests} |\n`;
}
md += `\n## Giới hạn phép đo\n- Cùng một máy chạy cả service, DB và trình duyệt; độ trễ mỗi service là **giả lập cố định** (LATENCY_MS), nên chênh lệch tuyệt đối không phản ánh môi trường thật.\n- Chỉ khởi động lại ứng dụng khi đo lạnh; cache của Postgres và hệ điều hành vẫn còn.\n- Ngưỡng 5 lần ấm là đề xuất của bài tập, không phải quy chuẩn; mẫu nhỏ nên khoảng [min–max] quan trọng hơn median.\n- "Hoàn tất" là DOM đã cập nhật xong, không bảo đảm trình duyệt đã vẽ xong.\n`;
const out = join(repo, 'results/evidence');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'measurements.md'), md);
console.log(`Đã ghi results/evidence/measurements.md (${rows.length} bản ghi${skipped ? `, bỏ qua ${skipped} testAdapter` : ''})`);
