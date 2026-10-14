# 0012. REST/JSON cho browser, gRPC giữa Order và Inventory

- **Trạng thái:** chấp nhận
- **Liên quan:** [ADR 0010](0010-mot-repo-hai-du-an-doc-lap.md) (`api` không đổi), [ADR 0011](0011-hop-dong-openapi-do-service-so-huu.md) (hợp đồng do service sở hữu), [ADR 0009](0009-log-stdout-moc-do-sau-co.md) (log)

## Bối cảnh
Luồng đặt hàng đi qua hai boundary với hai nhóm consumer khác nhau. Browser và bên thứ ba gọi `POST /orders` của Order và không do nhóm quyết định lịch cập nhật. Order gọi Inventory để giữ hàng; hai đầu do nhóm viết nhưng triển khai từng service riêng, nên một client cũ có thể chạy với server mới. Cần chuyển chặng trong từ REST sang gRPC mà API ngoài không đổi.

## Quyết định
1. **API ngoài giữ REST/JSON** (`POST /orders`; 201, 400, 409 `OUT_OF_STOCK`, 503 `INVENTORY_UNAVAILABLE`, 504 `INVENTORY_TIMEOUT`, 500). **Order → Inventory dùng gRPC**; REST của Inventory (`POST /inventory/reservations`) giữ làm baseline để so sánh.
2. **Hợp đồng gRPC là file `.proto` dùng chung** ở `services/proto/inventory/{v1,v2}`; mỗi service tự sinh code vào `src/generated/` (`grpc-tools` + `ts-proto`), không import mã sinh của service khác.
3. **Thêm field bằng tag mới và giữ nguyên `package kartvibe.inventory` cùng tên service.** v2 chỉ thêm `optional int32 available = 2`. Tên lời gọi gồm package (`/kartvibe.inventory.Inventory/Reserve`): đổi package thì client cũ không gọi được (đã thử).
4. **Thiếu hàng ở gRPC là `FAILED_PRECONDITION` kèm trailing metadata `x-error-code: OUT_OF_STOCK`**, tương ứng REST 409; Order dựa vào metadata chứ không chỉ vào status. Field `available` có presence; vắng thì Order ghi `absent`, không suy ra 0.
5. **Deadline 500 ms** (`INVENTORY_DEADLINE_MS`) cho cả hai client; ánh xạ lỗi: `DEADLINE_EXCEEDED` thành 504, `UNAVAILABLE` thành 503, `INVALID_ARGUMENT` thành 400.
6. **Hai bản Order chạy song song từ cùng mã nguồn** (`order` REST ở 4002, `order-grpc` ở 4012), chọn giao thức lúc khởi động bằng `INVENTORY_PROTOCOL`; không có công tắc ẩn trong API ngoài.
7. **Client cũ là bản Order build từ proto v1** (`order-v1`, tiến trình `order-grpc-v1`, 4022), đóng băng bằng `FROZEN.sha256`; server cũ tối thiểu là `inventory-v1` (`inventory-grpc-v1`, 4008).
8. **Không streaming, không gRPC-Web, không bù trừ** khi Order lỗi hoặc quá hạn sau khi Inventory đã giữ hàng.

## Lý do
- Browser không gọi gRPC native (cần gRPC-Web và proxy); REST/JSON dùng được từ mọi client và dễ debug. Chặng trong do một nhóm sở hữu cả hai đầu nên hưởng được hợp đồng sinh code và message nhỏ.
- Tag số là danh tính field, nên thêm tag mới tương thích hai chiều ở mức wire; đã chạy thật client cũ với server mới và client mới với server cũ.
- Hai bản Order cùng mã nguồn làm cho khác biệt giữa hai bản chỉ có thể do giao thức.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| gRPC-Web hoặc đổi API ngoài | Ngoài phạm vi; API ngoài phải giữ nguyên cho consumer không kiểm soát được |
| Thiếu hàng là `reserved=false` trong reply | Không đối xứng với REST 409: client REST và gRPC xử lý hai kiểu khác nhau |
| Proto v2 ở package khác | Client cũ bị từ chối (đã thử) |
| Chọn giao thức theo từng request (header) | Thêm đường điều khiển ẩn vào API ngoài; khó nói "đã chuyển sang gRPC" |
| Client cũ là CLI riêng | Không đi qua `POST /orders`; bằng chứng yếu hơn |
| `@grpc/proto-loader` (nạp proto lúc chạy) | Không có bước sinh code và lỗi compile để quan sát |
| Bù trừ hoặc idempotency khi quá hạn | Ngoài phạm vi; thuộc nội dung về retry và saga |

## Hệ quả
- Thêm bước sinh code (`npm run codegen` ở mỗi gói dùng gRPC); phiên bản `@grpc/grpc-js`, `grpc-tools`, `ts-proto` được ghim chính xác. Debug gRPC cần công cụ và `.proto`; log của hai service nối với nhau bằng `x-request-id` (header hoặc metadata).
- **Quá hạn không có nghĩa là chưa chạy:** Order trả 504 sau 500 ms nhưng Inventory vẫn giữ hàng xong sau đó (đã quan sát, ở cả REST lẫn gRPC), vì không có bù trừ. Vì vậy log của Inventory phải ghi cả những request mà client đã bỏ cuộc. Retry tự động cần idempotency.
- **Kênh gRPC có backoff:** sau khi Inventory tắt rồi bật lại, một số lần gọi đầu của Order có thể trả 503 ngay lập tức cho tới khi kênh kết nối lại; REST kết nối mới mỗi lần nên không bị. `start-all.sh` có vòng chờ TCP riêng cho cổng gRPC (4007) vì cổng này không có `/health` HTTP.
- Client cũ phải được giữ tương thích: thêm field tag mới là thay đổi an toàn ở mức wire, nhưng đổi nghĩa field cũ thì không (xem thêm: wire-compatible khác business-compatible).
- Mã sinh ra được commit; `order-v1` không được build lại (`npm run verify-frozen`).
