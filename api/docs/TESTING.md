# Testing (api)

Cách kiểm thử `api`. Chi tiết từng test case nằm trong mã (`api/evidence/build-collection.mjs`), không chép lại ở đây để tránh lệch. Lý do chọn công cụ: [ADR 0007](../../docs/decisions/0007-postman-newman-evidence.md).

## 1. Loại test hiện có

Chỉ có **test nghiệm thu black-box qua HTTP** bằng Postman collection chạy bằng newman. Chưa có unit test hay integration test riêng (không có file `*.test.*` hoặc `*.spec.*`).

Collection và environment trong `api/postman/` được **sinh** bởi `evidence/build-collection.mjs`; không sửa tay các file JSON đó. Muốn thêm hoặc sửa test case thì sửa script rồi chạy lại.

## 2. Cách chạy

Điều kiện: PostgreSQL đang chạy, `api/.env` đã cấu hình, server đang chạy (`npm run start`) ở `BASE_URL` (mặc định `http://localhost:3000`).

```bash
npm run evidence          # sinh collection, reset DB, chạy nhóm D, A, B, C
bash evidence/run-all.sh e1   # chỉ nhóm E (xem mục 4)
```

- **`npm run evidence` xóa dữ liệu**: nó chạy `scripts/reset.sh` (drop schema, migrate lại, seed) trên database trong `.env`. Đừng chạy trên DB có dữ liệu cần giữ.
- `reset.sh` có guard (`scripts/guard-reset.mjs`): in ra DB đích (host, cổng, tên, không in mật khẩu) và từ chối chạy khi `NODE_ENV=production` hoặc host trong `DATABASE_URL` không phải `localhost`/`127.0.0.1`/`::1`. Guard không hỏi xác nhận, vì `npm run evidence` gọi tự động.
- Báo cáo JSON ghi ở `api/evidence/output/newman-report.json` (đã gitignore).
- Chạy tay không reset: `npx newman run postman/kartvibe-api.postman_collection.json -e postman/kartvibe-api.postman_environment.json`.

## 3. Các nhóm test

| Nhóm | Chứng minh điều gì |
|---|---|
| **D** Happy path | Luồng thành công: liệt kê và phân trang sản phẩm, tạo giỏ, thêm, sửa, xóa item, tổng tiền đúng ở từng bước |
| **A** Schema validation | Request sai định dạng bị 400 `VALIDATION_ERROR`, `details` trỏ đúng field, và dữ liệu không đổi |
| **B** Not found | 404 `CART_NOT_FOUND`, `ITEM_NOT_FOUND`, `ROUTE_NOT_FOUND`; 405 `METHOD_NOT_ALLOWED` |
| **C** Business rules | Các quy tắc ở [domain/cart.md](../../docs/domain/cart.md): sản phẩm ngừng bán, hết hàng, vượt stock, trùng item, thứ tự lỗi, giỏ `checked_out` |
| **E** Server error | DB tắt → 500 `INTERNAL_ERROR` theo error contract |
| **F** (kiểm tra chung) | Chạy trên **mọi** response, không phải nhóm riêng: có `X-Request-Id` dạng UUID; lỗi đúng error contract; `request_id` trong body khớp header; không lộ stack trace hoặc SQL; response giỏ khớp schema |

Dữ liệu dùng trong test: [api/seeds/README.md](../seeds/README.md).

## 4. Quy ước và lưu ý

- **Thứ tự quan trọng.** Nhóm D tạo giỏ mà các nhóm A, B, C dùng lại (`activeCartId`), nên phải chạy theo thứ tự D → A → B → C trên DB vừa reset. Không chạy riêng lẻ một nhóm giữa chừng.
- **Nhóm E cần thao tác tay:** dừng PostgreSQL, rồi `bash evidence/run-all.sh e1` (lệnh này không reset DB vì DB đang tắt), rồi bật lại PostgreSQL.
- **So `code` và `field`, không so `message` hay `issue`**: câu chữ có thể đổi.
- **Tên request ghi ID quy tắc mà nó kiểm tra**, ví dụ `C4b — already in cart wins over stock [CART-06, CART-13]`. Tìm test của một quy tắc: `grep "CART-06" evidence/build-collection.mjs`. Test không gắn ID (ví dụ nhóm A, B6, B7) thuộc [CONVENTIONS](CONVENTIONS.md), không thuộc quy tắc domain. Thêm test mới thì ghi ID bằng tùy chọn `rules: [...]`.
- Test dùng UUID cố định từ `seeds/data/*.json`, nên không lệch với seed.
- **Test vượt stock ở POST phải dùng sản phẩm chưa có trong giỏ**, vì `ITEM_ALREADY_IN_CART` được kiểm tra trước (xem thứ tự lỗi trong `cart.md`).

## 5. Hạn chế đã biết

- Test A so sánh dữ liệu trước và sau để chứng minh request sai **không đổi dữ liệu**. Điều đó chưa chứng minh nó **không truy cập DB**; muốn chứng minh phải đếm query hoặc spy tầng DB.
- Chưa có test đồng thời (nhiều request cùng lúc vào một giỏ, hoặc nhiều giỏ cùng thêm sản phẩm `stock = 1`). Loại test này thuộc mức hệ thống; khi cần sẽ tạo thư mục `tests/` ở gốc repo.
- Chưa có cách tự động liệt kê quy tắc nào chưa có test; việc đối chiếu hiện làm tay bằng `grep` (xem mục 4).
- Mọi quy tắc `CAT-*`, `CART-*` hiện đều có ít nhất một test. Riêng trường hợp catalog rỗng hoàn toàn (`total: 0`) chưa được test, vì seed luôn có sản phẩm và API không có endpoint để tắt hết sản phẩm; `D2c` kiểm tra trang rỗng bằng `offset` vượt tổng.
- `docs/blocks/block-01/TEST_MATRIX.md` là bản mô tả bằng chữ của Block 1, script không đọc nó nên hai nơi có thể lệch nhau.
