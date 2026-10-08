# Trace N+1 của GraphQL (dữ liệu L)

Nguồn: log thật của Product Service (`product.log` trong thư mục log của start-all.sh), lọc theo `requestId` của **một** request GraphQL (query web: user, đơn, items, product). Tạo bởi `node export-trace.mjs --size L`.

| Chế độ | requestId | Lời gọi tới Product (`/_metrics`) | Truy vấn DB của Product | Số dòng log Product theo requestId |
|---|---|---:|---:|---:|
| `DATALOADER=off` (N+1) | `trace-n1-off-L-1791469000919` | 200 | 200 | 200 |
| `DATALOADER=on` (đã sửa) | `trace-n1-on-L-1791469000919` | 1 | 1 | 1 |

**Đọc kết quả:** khi tắt DataLoader, mỗi item trong đơn kích hoạt một lời gọi riêng `GET /products/:id` (N+1). Khi bật, các id trong cùng một request được gom và loại trùng, chỉ còn một lời gọi `GET /products?ids=...`, nên số lời gọi tới Product không tăng theo số đơn.

## Trước khi sửa (3 dòng đầu / tổng 200)
```
{"ts":"2026-10-08T14:16:41.126Z","service":"product","requestId":"trace-n1-off-L-1791469000919","method":"GET","path":"/products/8","status":200,"ms":35}
{"ts":"2026-10-08T14:16:41.132Z","service":"product","requestId":"trace-n1-off-L-1791469000919","method":"GET","path":"/products/10","status":200,"ms":40}
{"ts":"2026-10-08T14:16:41.136Z","service":"product","requestId":"trace-n1-off-L-1791469000919","method":"GET","path":"/products/24","status":200,"ms":43}
```

## Sau khi sửa (1 dòng)
```
{"ts":"2026-10-08T14:16:41.815Z","service":"product","requestId":"trace-n1-on-L-1791469000919","method":"GET","path":"/products?ids=8,19,30,11,15,26,7,18,22,3,14,25,29,10,21,2,6,17,28,9,1...
```
