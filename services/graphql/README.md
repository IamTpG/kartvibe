# GraphQL (cổng 4005)

Một endpoint `POST /graphql` phục vụ cả hai client (web, mobile) bằng hai query; gọi User, Order, Product qua REST theo [hợp đồng chung](../../docs/blocks/block-02/hop-dong-chung.md). Không truy vấn DB trực tiếp.

## Chạy

```bash
cd services && npm install          # lần đầu (npm workspaces)
cd graphql && npm start             # mặc định DATALOADER=on
DATALOADER=off npm start            # bản ngây thơ (N+1)
```

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 4005 | Cổng |
| `DATALOADER` | `on` | `on`: gom id + loại trùng trong một request, gọi `GET /products?ids=` một lần. `off`: mỗi item gọi riêng `GET /products/:id` (N+1) |
| `PRODUCT_TIMEOUT_MS` | 1000 | Hết thời gian chờ khi gọi Product → `product: null` + lỗi `PRODUCT_UNAVAILABLE` |
| `USER_SERVICE_URL`, `ORDER_SERVICE_URL`, `PRODUCT_SERVICE_URL` | `http://localhost:4001/2/3` | Địa chỉ các service |

Ghi đè công tắc cho một request mà không khởi động lại: `POST /graphql?dataloader=off`.

Khác: `GET /health`, `GET /_metrics` (`{"service":"graphql","requests":n,"dbQueries":0}`), `POST /_metrics/reset`.

## Hai query

```graphql
query Web($userId: Int!) {
  user(id: $userId) { id name }
  orders(userId: $userId) { id status createdAt items { productId quantity product { name price } } }
}
query Mobile($userId: Int!) {
  orders(userId: $userId) { id status items { product { name thumbnail } } }
}
```
```bash
curl -s localhost:4005/graphql -H 'content-type: application/json' \
  -d '{"query":"query($u:Int!){orders(userId:$u){id status items{product{name thumbnail}}}}","variables":{"u":1}}'
```

## Policy lỗi

Product lỗi hoặc quá thời gian chờ: `product` là `null` ở các item bị ảnh hưởng, kèm mục trong `errors` có `extensions.code = "PRODUCT_UNAVAILABLE"` và `path`. Không điền tên hay giá giả. User hoặc Order lỗi: `UPSTREAM_ERROR`.

## Trace N+1

Mỗi lời gọi đi ra và mỗi request được ghi một dòng JSON ra stdout (kèm `requestId`; `start-all.sh` ghi vào `services/logs/graphql.log`). Lọc theo `requestId` của một request: `DATALOADER=off` ra N dòng `upstream: product`, `on` ra đúng 1 dòng.

## Kiểm tra

Cần ba service (thật hoặc giả) và GraphQL đang chạy, với dữ liệu khớp `--size`:

```bash
SIZE=S node ../tools/mock-services.mjs   # dịch vụ GIẢ, chỉ để thử khi chưa có service thật
npm start                                # ở một terminal khác
npm test -- --size S                       # hoặc --size L (khớp SIZE của dịch vụ)
```
Bộ kiểm tra xác nhận: Product chỉ bị gọi 1 lần khi `on` (S và L), N lần khi `off`, dữ liệu hai chế độ giống nhau, trường mobile đúng, Product lỗi/quá hạn cho kết quả một phần đúng policy.
