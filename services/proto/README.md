# proto

Hợp đồng gRPC của Inventory. **Đóng băng**: chỉ team lead sửa. v2 chỉ thêm `optional int32 available = 3` vào `ReserveReply`; package và tên service giữ nguyên v1. Mỗi service tự sinh code từ các file này vào `src/generated/` của mình (xem `docs/blocks/block-03/PLAN.md`, mục 3.3).
