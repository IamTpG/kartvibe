# Trace N+1 của GraphQL (dữ liệu S)

Nguồn: log thật của Product Service (`product.log` trong thư mục log của start-all.sh), lọc theo `requestId` của **một** request GraphQL (query web: user, đơn, items, product). Tạo bởi `node export-trace.mjs --size S`.

| Chế độ | requestId | Lời gọi tới Product (`/_metrics`) | Truy vấn DB của Product | Số dòng log Product theo requestId |
|---|---|---:|---:|---:|
| `DATALOADER=off` (N+1) | `trace-n1-off-S-1791469050989` | 15 | 15 | 15 |
| `DATALOADER=on` (đã sửa) | `trace-n1-on-S-1791469050989` | 1 | 1 | 1 |

**Đọc kết quả:** khi tắt DataLoader, mỗi item trong đơn kích hoạt một lời gọi riêng `GET /products/:id` (N+1). Khi bật, các id trong cùng một request được gom và loại trùng, chỉ còn một lời gọi `GET /products?ids=...`, nên số lời gọi tới Product không tăng theo số đơn.

## Trước khi sửa (3 dòng đầu / tổng 15)
```
{"ts":"2026-10-08T14:17:31.124Z","service":"product","requestId":"trace-n1-off-S-1791469050989","method":"GET","path":"/products/10","status":200,"ms":35}
{"ts":"2026-10-08T14:17:31.125Z","service":"product","requestId":"trace-n1-off-S-1791469050989","method":"GET","path":"/products/9","status":200,"ms":36}
{"ts":"2026-10-08T14:17:31.125Z","service":"product","requestId":"trace-n1-off-S-1791469050989","method":"GET","path":"/products/6","status":200,"ms":36}
```

## Sau khi sửa (1 dòng)
```
{"ts":"2026-10-08T14:17:31.629Z","service":"product","requestId":"trace-n1-on-S-1791469050989","method":"GET","path":"/products?ids=8,9,10,5,6,7,2,3,4,1","status":200,"ms":33}
```
