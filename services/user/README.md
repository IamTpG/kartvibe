# User Service (Port 4001)

Service quản lý thông tin người dùng (API composition).

## 1. Yêu cầu môi trường
- Node.js >= 18
- PostgreSQL chạy tại `localhost:5434` (database: `kartvibe_user`, user: `postgres`, password: `postgres`).

## 2. Cài đặt và Khởi chạy

```bash
# Cài đặt dependencies
npm install

# Khởi tạo bảng và seed dữ liệu (SIZE=S mặc định, hoặc SIZE=L)
npm run seed:s
# hoặc
npm run seed:l

# Khởi chạy service
npm start
# hoặc chế độ dev (watch mode)
npm run dev
```

## 3. Các biến môi trường hỗ trợ
- `PORT`: Cổng dịch vụ (mặc định: `4001`).
- `LATENCY_MS`: Độ trễ giả lập cho request nghiệp vụ (mặc định `0`; `npm run start:measure` đặt `30`).
- `PGHOST`: Host Postgres (mặc định: `localhost`).
- `PGPORT`: Port Postgres (mặc định: `5434`).
- `PGUSER`: Username (mặc định: `postgres`).
- `PGPASSWORD`: Password (mặc định: `postgres`).
- `PGDATABASE`: Database (mặc định: `kartvibe_user`).

## 4. Kiểm thử các Endpoint (Curl Samples)

### Health Check
```bash
curl -i http://localhost:4001/health
# Trả về: 200 {"status":"ok"}
```

### Lấy thông tin User hợp lệ
```bash
curl -i -H "x-request-id: test-req-1" http://localhost:4001/users/1
# Trả về: 200 {"id":1,"name":"Người dùng 1"}
```

### Lấy thông tin User không tồn tại
```bash
curl -i http://localhost:4001/users/999
# Trả về: 404 {"code":"USER_NOT_FOUND","message":"User with id 999 not found"}
```

### Lấy thông tin User sai định dạng ID
```bash
curl -i http://localhost:4001/users/abc
# Trả về: 400 {"code":"VALIDATION_ERROR","message":"User ID must be an integer"}
```

### Đọc bộ đếm Metrics
```bash
curl -i http://localhost:4001/_metrics
# Trả về: 200 {"service":"user","requests":1,"dbQueries":1}
```

### Reset bộ đếm Metrics
```bash
curl -i -X POST http://localhost:4001/_metrics/reset
# Trả về: 204 No Content
```
