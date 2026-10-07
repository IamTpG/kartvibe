# 0007. Bằng chứng nghiệm thu bằng Postman collection + newman

- **Trạng thái:** chấp nhận
- **Nguồn:** Block 1

## Quyết định
Kịch bản nghiệm thu là Postman collection và environment, **sinh tự động** bởi `api/evidence/build-collection.mjs` (không sửa tay file JSON trong `postman/`). Các test case được định nghĩa trong chính script này; script chỉ đọc dữ liệu seed để lấy UUID. `npm run evidence` = reset DB + chạy newman. Chạy tay:
`npx newman run postman/kartvibe-api.postman_collection.json -e postman/kartvibe-api.postman_environment.json`

Dữ liệu seed tách thành `seeds/data/*.json` (có `alias` như SP1, CART_CLOSED); `seeds/seed.ts` và `build-collection.mjs` cùng đọc các file này nên chỉ có một nguồn sự thật. Thêm bảng seed mới là thêm một file JSON và một dòng trong `seed.ts` (theo thứ tự khóa ngoại).

## Lý do
Kịch bản chạy lại được, không phụ thuộc người thao tác; tránh lặp UUID giữa mã seed và test.

## Hệ quả
Test case nằm trong mã của generator. `TEST_MATRIX.md` (Block 1) là bản mô tả bằng chữ và không được đọc bởi script, nên hai nơi có thể lệch nhau nếu không đồng bộ tay.
