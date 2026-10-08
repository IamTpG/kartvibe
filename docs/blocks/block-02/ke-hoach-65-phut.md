# Kế hoạch 65 phút cho bài tập Block 2 (API composition)

> **Đây là kế hoạch tổ chức của nhóm, không phải "Plan" nộp bài.** Đề yêu cầu nhóm tự brainstorm với agent và ghi các quyết định vào Plan **trước khi viết BFF và GraphQL**. Mục "Chương trình buổi lập kế hoạch" bên dưới chỉ là danh sách việc cần chốt; Plan nộp phải do nhóm tạo cùng agent trong buổi học.
>
> Nguồn: `w02/BT_Block 2_ API composition.html`. Mọi giả định của người soạn được đánh dấu **(giả định)**.

## Phân công

| Mã | Người | Luồng |
|---|---|---|
| P1 | Phú | GraphQL, tổng hợp và tích hợp |
| P2 | Đạt | BFF + hai trang web (dashboard, mobile) |
| P3 | Thạnh | User Service + Order Service |
| P4 | Luân | Product Service (xong trước phút 25) |
| P5 | Anh | Bộ đo, bộ đối chiếu, README, ghi Plan |

## 1. Đề yêu cầu gì (tóm tắt)

| Hạng mục | Yêu cầu |
|---|---|
| Baseline | 3 service REST (User, Order, Product), **mỗi service một CSDL riêng**; trang dashboard gọi tuần tự từ browser. Nhóm tự thiết kế schema và dữ liệu: có product lặp giữa các đơn; **hai kích thước dữ liệu** (nhỏ, lớn) |
| Hai loại client | Web dashboard: đủ trường của đơn. Mobile: chỉ mã đơn, trạng thái, tên product, ảnh thumbnail. **Cả hai đều là trang web**; "mobile" là trang web bản gọn (ít thông tin hơn), không phải app riêng |
| BFF | **Một endpoint cho mỗi loại client** (web và mobile); server gọi 3 service |
| GraphQL | **Một endpoint**, hai query (web và mobile). Tái hiện N+1 rồi sửa bằng **batching và dedup trong phạm vi một request** |
| Đo | Request từ client; **DB query và service call ở từng service**; thời gian màn hình hoàn tất; **payload theo loại client**; hai kích thước dữ liệu; **lạnh** (lần chạy đầu sau khi khởi động lại service) và **ấm** (các lần sau); ≥ 5 lần, báo **median và khoảng giá trị** |
| Lỗi | Product chậm hoặc lỗi. Chọn **một policy cho cả BFF và GraphQL**: thất bại toàn bộ, hoặc trả một phần có đánh dấu lỗi. **Không thay tên hoặc giá bằng giá trị giả** |
| Tiêu chí đạt | Baseline, BFF, GraphQL trả cùng dữ liệu dashboard; response mobile chỉ có trường mobile cần; sau khi sửa N+1, **số call tới Product không tăng theo số đơn**; số liệu là kết quả chạy thật, kể cả chưa đạt |
| Sản phẩm nộp | Repo + README chạy lại toàn bộ; **Plan** (viết trước khi hiện thực BFF/GraphQL); waterfall của 3 biến thể kèm mốc hoàn tất; bảng đo thô từng lần + cách đếm; trace N+1 trước/sau; call graph nội bộ của BFF; đối chiếu dữ liệu 2 client; kết quả khi Product chậm/lỗi; ghi chú trade-off và giới hạn phép đo; dữ liệu giả |
| Trình bày (sau 65') | Problem, Solution, Demo (chạy thật, dữ liệu nhỏ), Evidence, Trade-off |
| Nguyên tắc | Đọc diff, giải thích log, bảo vệ quyết định; **câu trả lời của agent không phải evidence** |

## 2. Đánh giá: mã nền có sẵn lúc lập kế hoạch đáp ứng được đến đâu

| Hạng mục đề | Mã nền lúc lập kế hoạch (`services/`, `web/` bản đầu) | Việc phải làm |
|---|---|---|
| 3 service REST | Có | Giữ khung |
| **Mỗi service một CSDL riêng** | Chưa: 1 DB, 3 schema | Tách thành 3 database trong cùng container Postgres **(giả định: cùng server là đủ)** |
| Trường dữ liệu | Thiếu | Thêm `status` cho đơn, `thumbnail` cho product; giữ product lặp giữa các đơn |
| Hai kích thước dữ liệu | Có tham số số đơn | Chốt 2 cấu hình cụ thể **(giả định: nhỏ = 5 đơn × 3 item; lớn = 50 đơn × 4 item, ~30 product khác nhau)** |
| Bộ đếm theo từng service | Có (`/_metrics` mỗi service) | Giữ; in kết quả **tách theo service** |
| Endpoint lấy nhiều product | Chưa (cố ý) | Thêm để batching dùng |
| Trang dashboard tuần tự | Có (một trang) | Thêm công tắc chế độ, mốc "hoàn tất", bộ đếm request/byte trong trang, và **thêm trang mobile** (bản gọn) |
| BFF 2 endpoint | Chưa | Mới |
| GraphQL 2 query, N+1, batching + dedup | Chưa | Mới |
| Product chậm/lỗi | Chưa | Thêm cơ chế gây lỗi |
| Chế độ lạnh/ấm, ≥ 5 lần, median + khoảng | `measure.mjs` có nhiều lần, **chỉ median**, chạy bằng Node (không có render) | Thêm khoảng, lạnh/ấm, payload, theo loại client, ghi từng lần. Vì cả hai client là trang web nên **đo trong trình duyệt** (xem mục 3, #5–6) |
| Đối chiếu dữ liệu | Chưa | Mới |
| README, Plan, trace, call graph | Chưa | Mới |

Kết luận: mã nền giúp tiết kiệm phần khung và bộ đếm nhưng **phần lớn khối lượng của đề là mới** (BFF, GraphQL, gây lỗi, đo nâng cao, đối chiếu). 65 phút cho 5 người là rất chặt; cần song song hóa tối đa và có sẵn thứ tự cắt giảm (mục 7).

## 3. Chương trình buổi lập kế hoạch (0–12 phút, cả nhóm cùng agent)

Người ghi chép (P5) viết các quyết định vào Plan **ngay khi chốt**. Dưới đây là các việc cần chốt (đề xuất mặc định để rút ngắn thời gian):

| # | Chốt | Đề xuất mặc định |
|---|---|---|
| 1 | Schema 3 DB, dữ liệu mẫu | User(id, name); Order(id, userId, status, items[productId, qty]); Product(id, name, price, thumbnail). Product lặp giữa các đơn. Hai cấu hình dữ liệu như mục 2 |
| 2 | Hợp đồng REST của 3 service | `GET /users/:id`, `GET /orders?userId=`, `GET /products/:id`, **`GET /products?ids=1,2,3`** (batch) |
| 3 | Hợp đồng BFF | `GET /bff/web/dashboard?userId=` (đủ trường), `GET /bff/mobile/orders?userId=` (mã đơn, status, tên product, thumbnail) |
| 4 | Schema GraphQL | Một endpoint `POST /graphql`; query `webDashboard`, `mobileOrders` trả **cùng dữ liệu logic** như BFF |
| 5 | Cách đếm | Request client và payload: một **hàm bọc `fetch` trong trang** đếm số request nghiệp vụ (không tính reset/metrics) và tổng byte thân phản hồi nhận được (đếm trực tiếp từ nội dung, tránh phụ thuộc header Resource Timing vốn bị chặn khi khác origin). DB query và service call: bộ đếm của từng service, reset trước mỗi lần chạy |
| 6 | "Màn hình hoàn tất" | Cho **cả hai trang** (web và mobile): từ lúc bấm tải đến khi mọi đơn đã hiển thị đủ tên product (`performance.mark` sau lần cập nhật DOM cuối) |
| 6b | Baseline của trang mobile | Trang mobile gọi tuần tự 3 service như trang web, tự ráp rồi chỉ hiển thị trường mobile; payload = tổng byte nhận được (cho thấy dữ liệu thừa) |
| 7 | Lạnh/ấm | Lạnh: dừng và khởi động lại 3 service + BFF + GraphQL, chạy lần 1. Ấm: 5 lần sau. Báo median và [min, max] |
| 8 | Policy lỗi | **Trả một phần có đánh dấu lỗi** **(giả định, tự nhiên với GraphQL)**: đơn vẫn trả về, `product: null`, kèm danh sách lỗi và cờ `partial: true`; BFF làm tương đương. Timeout gọi Product (ví dụ 1000 ms). Không điền tên/giá giả |
| 9 | Cách gây lỗi | Product có công tắc: thêm độ trễ, hoặc trả 500 |
| 10 | Đối chiếu | So dữ liệu logic của baseline, BFF, GraphQL (đã chuẩn hóa); mobile chỉ được có đúng trường mobile |
| 11 | Trace | Truyền `x-request-id` từ BFF/GraphQL xuống service; mỗi service log lời gọi kèm id → dùng làm trace N+1 và call graph |
| 12 | Thư mục sở hữu | Xem mục 4 |

## 4. Năm luồng song song (12–38 phút)

Mỗi người sở hữu thư mục riêng để tránh xung đột. Sau khi hợp đồng (mục 3) chốt, mọi luồng chạy độc lập; luồng cần service thật dùng **mock** dựng từ hợp đồng cho đến khi có service thật.

| Người | Thư mục | Việc | Xong khi |
|---|---|---|---|
| **P1 (Phú)** | `services/graphql/` | Schema + 2 query; resolver **ngây thơ** (N+1) rồi **batching + dedup trong một request**, công tắc `DATALOADER=on\|off`; log lời gọi Product kèm request id; policy lỗi | Hai query trả đúng dữ liệu; thấy N+1 trong log khi tắt công tắc; Product được gọi không phụ thuộc số đơn khi bật |
| **P2 (Đạt)** | `services/bff/`, `web/` | 2 endpoint BFF + policy lỗi + call graph (log); **hai trang web** (dashboard và mobile) đều có chế độ `baseline\|bff\|graphql`, mốc hoàn tất, bộ đếm request/byte | Hai endpoint đúng hợp đồng; trang chuyển chế độ được |
| **P3 (Thạnh)** | `services/user/`, `services/order/` | Hai service, **hai database riêng**, seed 2 cấu hình, bộ đếm, truyền/ghi `x-request-id` | Chạy được, `/_metrics` đúng |
| **P4 (Luân)** | `services/product/` | Service + database riêng + seed + **endpoint batch** + công tắc chậm/lỗi + bộ đếm | Batch trả đúng; công tắc hoạt động. **Xong trước phút 25** (P1, P2 cần) |
| **P5 (Anh)** | `tests/`, `services/measure.mjs`, `web/measure-client.js`, `docs/` | Bộ đo: bộ chạy **ngay trong trang** (`web/measure-client.js`, dùng chung cho hai trang: nút "Chạy N lần", mỗi lần đo mốc hoàn tất, số request, byte); script Node khởi động lại service (đo lạnh) và đọc bộ đếm từng service; chế độ, lạnh/ấm, ≥ 5 lần, median + [min,max], payload, theo từng service, lưu từng lần thô; bộ đối chiếu dữ liệu; README; ghi Plan; ghi chú trade-off | Chạy được trên mock; có mẫu bảng kết quả |

Cột mốc: **phút 25** P3 + P4 có service thật; **phút 35** BFF và GraphQL chạy với service thật; **phút 38** dừng viết mã mới.

## 5. Tích hợp và đo (38–58 phút, gần như tuần tự)

| Phút | Việc | Ai |
|---|---|---|
| 38–43 | Dựng toàn bộ, **review chéo diff** (P1↔P2, P3↔P4; P5 đọc tất cả) và sửa lỗi ghép | Cả nhóm |
| 43–51 | **Chạy đo** (không làm gì khác nặng trên máy; mỗi cấu hình: khởi động lại service để đo lạnh, mở trang rồi bấm chạy 1 lần lạnh + 5 lần ấm): baseline, BFF, GraphQL ngây thơ, GraphQL đã sửa; 2 kích thước; 2 client; lạnh/ấm; ≥ 5 lần | P5 chạy, P1 theo dõi |
| 51–55 | Chạy kịch bản Product chậm và lỗi cho BFF và GraphQL | P4 + P2 |
| 51–58 | Chụp waterfall (**tách khỏi lúc đo thời gian**, vì chạy đồng thời làm sai số), trace N+1 trước/sau, call graph BFF | P2, P1 |
| 55–58 | Chạy bộ đối chiếu dữ liệu và kiểm tra trường mobile | P5 |

Số cấu hình cần đo: 4 biến thể × 2 client × 2 kích thước = 16, mỗi cái 1 lạnh + 5 ấm. Tùy chọn tăng tốc: một script mở sẵn URL có tham số (`?mode=...&client=...&size=...&auto=1`) bằng lệnh mở trình duyệt của hệ điều hành, trang tự chạy và gửi kết quả về server tĩnh. Tab phải ở nền trước vì tab nền bị trình duyệt giảm tốc.

## 6. Hoàn thiện (58–65 phút)

Điền bảng kết quả (kể cả kết quả chưa đạt, ghi đúng như đo), README chạy lại toàn bộ, ghi chú trade-off và giới hạn phép đo (cùng một máy, độ trễ giả, cache DB, số lần chạy nhỏ). Đề nói rõ ngưỡng 5 lần là đề xuất, không phải quy chuẩn: ghi điều đó vào giới hạn. **Rút thăm người trình bày** và mỗi người ôn 1 câu cốt lõi. Phần trình bày diễn ra sau 65 phút.

## 7. Nếu thiếu thời gian, cắt theo thứ tự

1. Bản mobile của baseline đo chi tiết (giữ phần đối chiếu trường).
2. Call graph bằng hình (giữ log gọi làm bằng chứng).
3. Chạy lạnh cho cả hai kích thước (giữ lạnh ở kích thước nhỏ).
4. Làm đẹp giao diện.

**Không cắt:** baseline, BFF, GraphQL (ngây thơ và đã sửa) với bằng chứng N+1; đối chiếu dữ liệu; policy lỗi chạy thật; số liệu thô thật.

## 8. Ánh xạ sản phẩm nộp → người phụ trách

| Sản phẩm | Người |
|---|---|
| README chạy lại | P5 |
| Plan | P5 ghi, cả nhóm chốt |
| Waterfall 3 biến thể | P2 |
| Bảng đo thô + cách đếm | P5 |
| Trace N+1 trước/sau | P1 |
| Call graph BFF | P2 |
| Đối chiếu dữ liệu 2 client | P5 |
| Kết quả Product chậm/lỗi | P4 (+P2, P1) |
| Trade-off và giới hạn phép đo | P5 + cả nhóm |

## 9. Rủi ro

- **Hợp đồng chốt sai hoặc mơ hồ:** các luồng lệch nhau. Dành đủ 12 phút đầu và cho mọi người đọc lại bản chốt.
- **P4 trễ endpoint batch:** chặn cả BFF tối ưu lẫn batching của GraphQL. Làm đầu tiên.
- **Đo trong lúc máy bận:** số liệu nhiễu. Đo tự động khi không chạy việc nặng khác; ghi lại điều kiện đo.
- **Đo trong trình duyệt tốn thao tác:** 16 cấu hình × (1 lạnh + 5 ấm). Dùng bộ chạy trong trang để mỗi cấu hình chỉ cần vài cú bấm. Mọi lần đo thời gian phải trên **một máy**, tab ở nền trước, không chạy việc nặng khác; ghi điều kiện này vào giới hạn phép đo.
- **Mỗi service một CSDL riêng**: nếu giảng viên hiểu là cần server riêng, phải đổi; hỏi trước nếu có thể.
- **Đề có thể mơ hồ về "lạnh" và "màn hình hoàn tất"**: ghi định nghĩa đã chọn vào Plan.

## 10. Chuẩn bị trước buổi học (không vi phạm quy trình lập Plan)

- Nếu chuẩn bị mã nền trước, thêm sẵn bộ chạy trong trang (`web/measure-client.js`) và thử bấm chạy một lần trên máy thật.
- Gộp nhánh `lab/block-02-03` (mã nền) vào nhánh làm bài; mọi người clone, `npm install`, chạy thử baseline một lần.
- Kiểm tra Docker, Node, cổng 4000–4003 và 5434 trống; thống nhất mỗi người dùng Postgres riêng hay chung một máy.
- Thống nhất cách giao việc cho agent và checklist rà soát (ghi chú Block 2 đã có).
- **Không** soạn sẵn Plan nộp: nhóm phải tạo nó cùng agent trong buổi học.
