# Môi trường chạy thử

## Yêu cầu

- Node.js ≥ 22 (đã thử trên 24). Docker (cho Postgres).
- Phiên bản thư viện gRPC được ghim (không tự nâng): `@grpc/grpc-js` **1.14.6**, `grpc-tools` **1.13.1**, `ts-proto` **2.13.0**. Ghi **phiên bản chính xác, không dấu `^`**, trong `package.json` của mọi thư mục dùng gRPC (các thư mục này sẽ nằm trong cùng npm workspaces, và client cũ phải đóng băng).
- Khi `npm install` có thể thấy cảnh báo `allow-scripts` về `grpc-tools` và `protobufjs`; trong lần thử của team lead `protoc` vẫn dùng được. Nếu bạn gặp lỗi, ghi lại nguyên văn vào `HANDOVER.md`.

## Postgres

Cổng 5434, user `postgres`, mật khẩu `postgres` (chỉ dùng cục bộ, dữ liệu giả).

```bash
docker run -d --name kartvibe-postgres -e POSTGRES_PASSWORD=postgres -p 5434:5432 postgres:17
# tạo database (chạy một lần cho mỗi cái bạn cần)
docker exec kartvibe-postgres psql -U postgres -c "CREATE DATABASE kartvibe_inventory"
docker exec kartvibe-postgres psql -U postgres -c "CREATE DATABASE kartvibe_order"
```

Container đã có thì chỉ cần `docker start kartvibe-postgres`.

## Cổng

| Thành phần | Cổng |
|---|---|
| `web` (trang tĩnh, `npm start` trong `web/`) | 4000 |
| `order` (REST) | 4002 |
| `order-grpc` (cùng mã nguồn, chế độ gRPC) | 4012 |
| `inventory` REST | 4006 |
| `inventory` gRPC | 4007 |
| `order-grpc-v1` (client cũ; mã ở thư mục `order-v1/`, do team lead dựng sau) | 4022 |
| `inventory-grpc-v1` (server cũ; mã ở thư mục `inventory-v1/`) gRPC | 4008 |

## Sinh code từ proto

Chạy từ thư mục service đã cài `grpc-tools` và `ts-proto`; đường dẫn tới `proto/` điều chỉnh theo nơi bạn đặt bản sao của nó (trong `kem-theo/`):

```bash
./node_modules/.bin/grpc_tools_node_protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=src/generated \
  --ts_proto_opt=outputServices=grpc-js,esModuleInterop=true \
  -I <thư-mục-chứa-proto> <thư-mục-chứa-proto>/inventory.proto
```

Mã sinh ra **được commit** trong `src/generated/` và thư mục có script `npm run codegen` để sinh lại.
