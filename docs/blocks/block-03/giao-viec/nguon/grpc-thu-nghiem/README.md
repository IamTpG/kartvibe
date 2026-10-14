# Thử nghiệm toolchain gRPC (tham khảo, bỏ đi sau khi dùng)

Hai tệp team lead dùng để thử `@grpc/grpc-js` + `grpc-tools` + `ts-proto`. Kết quả đã thấy:

- `t.ts`: server v2, client v1 và v2 trong một process. Client v1 chạy với server v2; `available = 0` **có mặt** (khác với vắng); thiếu hàng trả `FAILED_PRECONDITION`; request Protobuf 6 byte, JSON 25 byte.
- `t2.ts`: lỗi `FAILED_PRECONDITION` kèm trailing metadata `x-error-code`; client đọc lại được bằng `err.metadata.get('x-error-code')`.

## Cách chạy

Trong một thư mục sạch (có `kem-theo/proto/` ở cạnh), cài `@grpc/grpc-js@^1.14.6 grpc-tools@^1.13.1 ts-proto@^2.13.0 tsx typescript`, rồi:

```bash
mkdir -p gen/v1 gen/v2
for v in v1 v2; do
  ./node_modules/.bin/grpc_tools_node_protoc \
    --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
    --ts_proto_out=gen/$v \
    --ts_proto_opt=outputServices=grpc-js,esModuleInterop=true \
    -I <đường-dẫn>/proto/inventory/$v <đường-dẫn>/proto/inventory/$v/inventory.proto
done
./node_modules/.bin/tsx t.ts
./node_modules/.bin/tsx t2.ts
```
