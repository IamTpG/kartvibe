# Seed

Nguồn sự thật: `data/*.json` (alias `SP1`..`SP5`, `CART_CLOSED`, `CART_WITH_INACTIVE` không phải cột DB). Seed idempotent: xóa sạch rồi nạp lại. Trạng thái sạch: `products = 5`, `carts = 2`, `cart_items = 2`.

Chạy: `npm run seed`; làm lại từ đầu: `npm run reset`.

## Mỗi fixture phục vụ tình huống nào

| Alias | Dữ liệu | Dùng để |
|---|---|---|
| SP1 | `stock = 3`, giá 5000 | Happy path: thêm 2, PATCH lên 3 vẫn hợp lệ; giá dễ kiểm tra tổng |
| SP2 | `stock = 50`, giá 15000 | Tính tổng nhiều dòng. Không dùng để thử vượt stock (quantity tối đa 10, sẽ sai schema trước) |
| SP3 | `stock = 1`, giá 8000 | Thử vượt stock với `quantity = 2` (chưa có trong giỏ) |
| SP4 | `stock = 0`, đang bán | Vẫn được liệt kê; thêm vào giỏ → `INSUFFICIENT_STOCK` |
| SP5 | còn hàng, `is_active = false` | Không được liệt kê; thêm vào giỏ → `PRODUCT_UNAVAILABLE` |
| CART_CLOSED | `checked_out`, có SP1 × 2 | Thử từ chối ghi → `CART_CLOSED`; giỏ đóng vẫn hiện item và tính tổng (`CART-04`) |
| CART_WITH_INACTIVE | `open`, có SP5 × 1 (SP5 đã ngừng bán) | Sản phẩm ngừng bán vẫn hiện trong giỏ (`CART-04`); PATCH vẫn được phép (`CART-08`). Test PATCH làm đổi giỏ này, nên cần reset trước khi chạy lại |

Sau seed, `GET /products` trả 4 sản phẩm (SP1..SP4).
