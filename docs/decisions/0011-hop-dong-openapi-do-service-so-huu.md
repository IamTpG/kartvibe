# 0011. Hợp đồng do từng service sở hữu: Zod → OpenAPI 3.1, bên tiêu thụ sinh kiểu từ spec

- **Trạng thái:** chấp nhận
- **Liên quan:** [ADR 0002](0002-code-first-zod-openapi.md) (cùng cách làm ở `api`), [ADR 0010](0010-mot-repo-hai-du-an-doc-lap.md)

## Bối cảnh
Hợp đồng giữa các service ban đầu chỉ là một tài liệu văn bản. `check-contract` kiểm phía cung cấp, còn BFF và GraphQL tự khai báo lại kiểu `User`, `Order`, `Product` và test của BFF dựng service giả theo trí nhớ của người viết. Hai nửa không nối với nhau: service giả lệch khỏi hợp đồng mà không test nào báo (thực tế đã lệch: product giả thiếu `sku` và `description`).

## Quyết định
1. **Mỗi service sở hữu hợp đồng của mình** trong `src/contract.ts`: Zod 4 (`strictObject`) và `@asteasolutions/zod-to-openapi` 9, giống `api` (ADR 0002). Từ đó sinh `openapi.json` (OpenAPI 3.1) đặt cạnh service và **commit vào repo** như một artifact công bố.
2. **Bên tiêu thụ sinh kiểu TypeScript từ spec của bên cung cấp** (`openapi-typescript`) vào `src/generated/<provider>.d.ts`. BFF và GraphQL không còn tự khai báo kiểu của User, Order, Product. Không service nào import mã của service khác.
3. **Một bộ kiểm duy nhất theo spec** (`tools/contract.mjs`, dùng `ajv`): `check-contract` kiểm service thật; test của BFF kiểm mọi phản hồi của service giả và body BFF trả ra; test của GraphQL kiểm `data` của hai query; `tools/tests/contracts.test.mjs` kiểm spec bắt đúng các lỗi cần bắt.
4. **Chống lệch:** `npm run contracts` sinh lại spec và kiểu; `npm run contracts:check` thoát mã 1 nếu mã, `openapi.json` hoặc kiểu đã commit không khớp nhau.
5. Phản hồi thành công của User, Order, Product và BFF được gán kiểu từ chính hợp đồng của service đó, nên `tsc` bắt lệch giữa mã và hợp đồng.
6. GraphQL công bố `POST /graphql` và hai schema `WebData`, `MobileData` (cùng hình dạng thân BFF, bỏ `partial` và `errors`). Hình dạng của GraphQL còn do SDL trong `schema.ts` định nghĩa; hai nơi này chưa được kiểm tự động với nhau ngoài các test chạy thật.

## Lý do
- Hợp đồng là dữ liệu có thể kiểm, thuộc về bên cung cấp; bên tiêu thụ phụ thuộc vào artifact đã công bố, không vào mã. Đây là mô hình phổ biến cho REST (OpenAPI + sinh kiểu).
- Nhất quán với `api`: cùng Zod, cùng OpenAPI 3.1.
- Không tạo phụ thuộc mã giữa các service nên không đẩy hệ thống về phía monolith phân tán.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| JSON Schema viết tay trong một thư mục chung (bản đầu của ADR này) | Không có chủ sở hữu rõ, không sinh kiểu, lặp định nghĩa giữa các schema, dễ lệch khỏi mã |
| Package kiểu TypeScript dùng chung | Ràng buộc mã giữa các service |
| Pact (hợp đồng do bên tiêu thụ sinh) | Nặng so với năm service do một nhóm sở hữu; spec dùng chung đủ cho nhu cầu hiện tại |
| Chỉ giữ văn bản và `check-contract` | Không bắt được service giả của bên tiêu thụ lệch hợp đồng |

## Hệ quả
- Sửa hợp đồng: sửa `src/contract.ts` của service, chạy `npm run contracts`, xem diff của `openapi.json` và kiểu, rồi chạy `npm run check` cùng test của BFF/GraphQL. Quên bước sinh lại thì `contracts:check` báo.
- Cần hai dependency phát triển ở mỗi service (`zod`, `zod-to-openapi`) và ba ở gốc (`openapi-typescript`, `ajv`, `ajv-formats`). Service chạy thật chỉ import kiểu từ `contract.ts` (type-only, bị xóa lúc chạy), nên Zod không vào đường chạy.
- **Chưa làm:** phát hiện thay đổi phá vỡ giữa hai phiên bản spec (ví dụ `oasdiff`); hiện chỉ xem diff của `openapi.json` bằng mắt. Chưa kiểm request (query, body của `/_fault`). `tools/mock-services.mjs` chưa được kiểm theo spec. `hop-dong-chung.md` vẫn là tài liệu diễn giải của bài nộp; nếu lệch spec thì spec đúng.
- Hợp đồng trước đây là `services/contracts/*.json` (chưa từng được commit) đã bị thay thế.
