# Order Service (Port 4002)

Service quản lý đơn hàng (API composition).

## 1. Yêu cầu môi trường
- Node.js >= 18
- PostgreSQL chạy tại `localhost:5434` (database: `kartvibe_order`, user: `postgres`, password: `postgres`).

## 2. Cài đặt và Khởi chạy

```bash
# Cài đặt dependencies
npm install

# Khởi tạo bảng và seed dữ liệu (cấu hình S: 5 đơn, k=3 items; hoặc L: 50 đơn, k=4 items)
npm run seed:s
# hoặc
npm run seed:l

# Khởi chạy service
npm start
# hoặc chế độ dev (watch mode)
npm run dev
```

## 3. Các biến môi trường hỗ trợ
- `PORT`: Cổng dịch vụ (mặc định: `4002`).
- `LATENCY_MS`: Độ trễ giả lập cho request nghiệp vụ (mặc định `0`; `npm run start:measure` đặt `30`).
- `PGHOST`: Host Postgres (mặc định: `localhost`).
- `PGPORT`: Port Postgres (mặc định: `5434`).
- `PGUSER`: Username (mặc định: `postgres`).
- `PGPASSWORD`: Password (mặc định: `postgres`).
- `PGDATABASE`: Database (mặc định: `kartvibe_order`).

## 4. Kiểm thử các Endpoint (Curl Samples)

### Health Check
```bash
curl -i http://localhost:4002/health
# Trả về: 200 {"status":"ok"}
```

### Lấy danh sách đơn hàng của User
```bash
curl -i -H "x-request-id: test-req-order-1" http://localhost:4002/orders?userId=1
```
Trả về (theo mẫu S):
```json
{
  "data": [
    {
      "id": 1,
      "userId": 1,
      "status": "PENDING",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "items": [
        { "productId": 8, "quantity": 2 },
        { "productId": 9, "quantity": 3 },
        { "productId": 10, "quantity": 1 }
      ]
    },
    {
      "id": 2,
      "userId": 1,
      "status": "PAID",
      "createdAt": "2026-01-02T00:00:00.000Z",
      "items": [
        { "productId": 5, "quantity": 3 },
        { "productId": 6, "quantity": 1 },
        { "productId": 7, "quantity": 2 }
      ]
    }
  ]
}
```

### Kiểm tra trường hợp user không có đơn
```bash
curl -i http://localhost:4002/orders?userId=999
# Trả về: 200 {"data":[]}
```

### Kiểm tra trường hợp thiếu hoặc sai `userId`
```bash
curl -i http://localhost:4002/orders
# Trả về: 400 {"code":"VALIDATION_ERROR","message":"userId query parameter is required"}

curl -i http://localhost:4002/orders?userId=xyz
# Trả về: 400 {"code":"VALIDATION_ERROR","message":"userId must be a valid integer"}
```

### Đọc bộ đếm Metrics
```bash
curl -i http://localhost:4002/_metrics
# Trả về: 200 {"service":"order","requests":1,"dbQueries":2}
```
*(Ghi chú: Mỗi request `/orders?userId=...` thực thi đúng 2 truy vấn DB: 1 lấy danh sách orders, 1 lấy danh sách order_items)*

### Reset bộ đếm Metrics
```bash
curl -i -X POST http://localhost:4002/_metrics/reset
# Trả về: 204 No Content
```
