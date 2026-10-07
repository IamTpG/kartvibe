# 0001. Dùng Node.js + Express, chạy TypeScript bằng tsx

- **Trạng thái:** chấp nhận
- **Nguồn:** Block 1

## Quyết định
Backend dùng Node.js + Express 5. TypeScript chạy trực tiếp bằng `tsx` (`npm run dev` = `tsx watch`, `npm run start` = `tsx`), không có bước build; `npm run build` chỉ type-check (`tsc --noEmit`).

## Lý do
Cả nhóm quen Express, hệ sinh thái lớn nhất, đủ middleware cho validation, logging, docs. `tsx` thay `nodemon` vì chạy TS trực tiếp, không cần build step.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| Node.js + Fastify | Nhanh hơn nhưng nhóm chưa quen plugin system và schema tích hợp; lợi thế hiệu năng không cần ở scale bài tập. |
| Bun + Hono | Runtime Bun còn mới, tương thích thư viện chưa ổn định; rủi ro mất thời gian debug môi trường. |
