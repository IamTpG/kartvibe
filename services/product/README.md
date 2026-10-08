# Product Service (`services/product`)

Service quản lý thông tin sản phẩm (`kartvibe_product`) trên cổng **4003**, cài đặt đầy đủ theo [hop-dong-chung.md](../../docs/blocks/block-02/hop-dong-chung.md).

## 1. Cài đặt và khởi chạy

```bash
cd services/product
npm install

# Seed dữ liệu cấu hình nhỏ (SIZE=S: 10 sản phẩm) hoặc lớn (SIZE=L: 30 sản phẩm)
npm run seed:s
# hoặc:
npm run seed:l

# Chạy Product Service ở cổng 4003 (mặc định LATENCY_MS=0; `npm run start:measure` ở `services/` đặt 30 và bật `/_fault`)
npm start
```

> **Ghi chú về CSDL (`kartvibe_product`):**
> - Mặc định kết nối tới Postgres tại `localhost:5434` (`user=postgres`, `password=postgres`, `database=kartvibe_product`) và tự động tạo database `kartvibe_product` + bảng `products` nếu chưa có.
> - Nếu máy chưa bật Docker container `kartvibe-postgres`, service tự động chuyển sang bộ nhớ SQL tương thích (in-memory fallback) với đúng dữ liệu mẫu và cách đếm `dbQueries` để có thể tích hợp và kiểm thử ngay lập tức.

## 2. Seed `S` và `L`

- **Cấu hình `S` (10 sản phẩm, `id` từ `1..10`):**
  ```bash
  npm run seed:s
  # hoặc khi server đang chạy:
  curl -X POST http://localhost:4003/_seed -H "Content-Type: application/json" -d "{\"size\":\"S\"}"
  ```
- **Cấu hình `L` (30 sản phẩm, `id` từ `1..30`):**
  ```bash
  npm run seed:l
  # hoặc khi server đang chạy:
  curl -X POST http://localhost:4003/_seed -H "Content-Type: application/json" -d "{\"size\":\"L\"}"
  ```

Công thức dữ liệu mẫu cho sản phẩm `id`:
- `sku`: `"SKU-" + id (3 chữ số)` (ví dụ `"SKU-008"`)
- `name`: `"Sản phẩm " + id (2 chữ số)` (ví dụ `"Sản phẩm 08"`)
- `price`: `10000 + id * 500` (ví dụ `14000`)
- `thumbnail`: `"https://img.example.test/p/{id}.jpg"`
- `description`: `"Mô tả sản phẩm {id}. "` lặp 6 lần

## 3. Các Endpoint theo hợp đồng

| Phương thức & Đường dẫn | Mô tả | Tính vào `_metrics`? |
|---|---|---|
| `GET /health` | Trả `200 {"status":"ok"}` | Không |
| `GET /_metrics` | Trả `200 {"service":"product","requests":n,"dbQueries":m}` | Không |
| `POST /_metrics/reset` | Reset bộ đếm `requests` và `dbQueries` về `0` (`204`) | Không |
| `GET /_fault` | (chỉ khi `ENABLE_TEST_HOOKS=1`) Xem trạng thái gây lỗi hiện tại `{"latencyMs":0,"error":false}` | Không |
| `POST /_fault` | (chỉ khi `ENABLE_TEST_HOOKS=1`) Cấu hình gây lỗi chậm / lỗi 500 / xóa lỗi | Không |
| `GET /products/:id` | Lấy 1 sản phẩm (`1 request`, `1 dbQuery`) | **Có** |
| `GET /products?ids=8,9,10` | Lấy nhiều sản phẩm (`1 request`, `1 dbQuery`) | **Có** |

## 4. Bằng chứng: `GET /products?ids=` chỉ tốn **1 truy vấn DB**

Trong [`src/db.ts`](./src/db.ts), hàm `queryProductsByIds` thực thi **duy nhất 1 câu SQL**:

```sql
SELECT id, sku, name, price, thumbnail, description
FROM products
WHERE id = ANY($1::int[])
ORDER BY id ASC
```

### Quy trình kiểm chứng bằng `curl`:

```bash
# Bước 1: Reset bộ đếm
curl -i -X POST http://localhost:4003/_metrics/reset

# Bước 2: Gọi endpoint batch với danh sách có ID trùng (8) và ID không tồn tại (999)
curl -s "http://localhost:4003/products?ids=10,8,9,8,999" -H "x-request-id: demo-batch-1"
```

Kết quả trả về (`id` đã loại trùng, bỏ qua `999`, sắp xếp tăng dần `8, 9, 10`):
```json
{
  "data": [
    {
      "id": 8,
      "sku": "SKU-008",
      "name": "Sản phẩm 08",
      "price": 14000,
      "thumbnail": "https://img.example.test/p/8.jpg",
      "description": "Mô tả sản phẩm 8. Mô tả sản phẩm 8. Mô tả sản phẩm 8. Mô tả sản phẩm 8. Mô tả sản phẩm 8. Mô tả sản phẩm 8. "
    },
    {
      "id": 9,
      "sku": "SKU-009",
      "name": "Sản phẩm 09",
      "price": 14500,
      "thumbnail": "https://img.example.test/p/9.jpg",
      "description": "Mô tả sản phẩm 9. Mô tả sản phẩm 9. Mô tả sản phẩm 9. Mô tả sản phẩm 9. Mô tả sản phẩm 9. Mô tả sản phẩm 9. "
    },
    {
      "id": 10,
      "sku": "SKU-010",
      "name": "Sản phẩm 10",
      "price": 15000,
      "thumbnail": "https://img.example.test/p/10.jpg",
      "description": "Mô tả sản phẩm 10. Mô tả sản phẩm 10. Mô tả sản phẩm 10. Mô tả sản phẩm 10. Mô tả sản phẩm 10. Mô tả sản phẩm 10. "
    }
  ]
}
```

```bash
# Bước 3: Kiểm tra bộ đếm /_metrics
curl -s http://localhost:4003/_metrics
```

Kết quả:
```json
{"service":"product","requests":1,"dbQueries":1}
```

## 5. Kiểm thử `/_fault` cả 3 chế độ

### Chế độ 1: Bật độ trễ cao (`latencyMs: 1500, error: false`)
```bash
curl -s -X POST http://localhost:4003/_fault -H "Content-Type: application/json" -d "{\"latencyMs\":1500,\"error\":false}"
# -> {"latencyMs":1500,"error":false}

curl -s http://localhost:4003/products/8 -H "x-request-id: fault-slow-1"
# -> Trả 200 sau ~1530 ms (30ms LATENCY_MS của start:measure + 1500ms fault)
```

### Chế độ 2: Bật lỗi 500 (`latencyMs: 0, error: true`)
```bash
curl -s -X POST http://localhost:4003/_fault -H "Content-Type: application/json" -d "{\"latencyMs\":0,\"error\":true}"
# -> {"latencyMs":0,"error":true}

curl -i http://localhost:4003/products/8 -H "x-request-id: fault-err-1"
# -> HTTP/1.1 500 Internal Server Error
# -> {"code":"INTERNAL_ERROR","message":"Product service fault injection is active"}

curl -i "http://localhost:4003/products?ids=8,9,10" -H "x-request-id: fault-err-2"
# -> HTTP/1.1 500 Internal Server Error
# -> {"code":"INTERNAL_ERROR","message":"Product service fault injection is active"}
```

### Chế độ 3: Xóa lỗi (`POST /_fault {}`)
```bash
curl -s -X POST http://localhost:4003/_fault -H "Content-Type: application/json" -d "{}"
# -> {"latencyMs":0,"error":false}

curl -s http://localhost:4003/_fault
# -> {"latencyMs":0,"error":false}
```

## 6. Kiểm tra tự động toàn bộ hợp đồng

```bash
npm run verify
```
