# Dàn ý slide trình bày Block 3 (bản nháp v11 để duyệt)

> **Bản nháp.** `slides.html` đã dựng theo bản này (13 slide chính + phụ lục). Mọi con số đo (payload, thời gian) để `…` và phải điền từ `results/block-03/` sau khi chạy `chay-lai.sh`; không gõ từ trí nhớ.

## Thứ tự

Theo đúng yêu cầu của đề: **Problem, Solution, Demo, Evidence, Trade-off**. Trước demo, phần Solution đã cho người nghe biết hệ thống, hợp đồng gRPC (thêm field) và luồng client cũ gặp server mới, nên demo không có màn hình lạ. Các bảng Lợi/Hại (quyết định) nằm ở Trade-off, cuối bài.

## Nguyên tắc

- Giảng viên đã dạy REST và gRPC, nên **không giải thích lại khái niệm**. Cái cần chia sẻ: hệ thống đang làm gì, quyết định đã đưa ra kèm trade-off, vấn đề gặp phải.
- Mỗi slide chỉ một ý chính; chữ ngắn, chi tiết nằm ở lời dẫn và phụ lục.
- **Mỗi sơ đồ archify là một slide riêng, chiếm cả khung** (năm sơ đồ chính: 01, 11, 03, 09, 06; đã chốt).
- Demo chạy thật (đề yêu cầu không thay bằng ảnh chụp mã).

## Danh sách slide (19 slide chính: 18 slide theo thứ tự năm phần của đề, thêm slide Q&A ở cuối)

Thứ tự của đề: **Problem, Solution, Demo, Evidence, Trade-off**. Nhãn tên phần hiện trên thanh tiêu đề của từng slide. Hai slide mô tả thứ nhóm đã dựng (thêm field, client cũ gặp server mới) đặt ở Solution để người nghe hiểu trước khi demo; các bảng Lợi/Hại và phần kết luận nằm ở Trade-off, sau Evidence.

| # | Phần | Slide | Loại | Phút |
|---|---|---|---|---|
| 1 | Problem | Bài toán: đặt hàng đi qua hai chặng (trước/sau, điều phải đạt, câu hỏi) | chữ + hình ô chữ | 1 |
| 2 | Problem | Phạm vi: vì sao chỉ đổi chặng 2 | chữ | 0,75 |
| 3 | Solution | **Kiến trúc** | sơ đồ 01 | 1,5 |
| 4 | Solution | **Cơ sở dữ liệu: ba bảng** | sơ đồ 11 (ER vẽ tay) | 1 |
| 5 | Solution | **Một lần đặt hàng đủ hàng, từng bước** | sơ đồ 03 | 1,5 |
| 6 | Solution | Thêm field mà client cũ không vỡ | chữ + mã | 1 |
| 7 | Solution | **Client cũ gặp server mới** | sơ đồ 09 | 1 |
| 8 | Solution | **Cách xử lý khi hết hàng** | sơ đồ 04 | 1 |
| 9 | Solution | **Cách xử lý khi Inventory chậm hoặc tắt** | sơ đồ 06 | 1,25 |
| 10 | Demo | **Demo: các luồng sẽ chạy** (7 luồng, 6 luồng chính in đậm) | bảng + demo | 5 đến 6 |
| 11 | Evidence | Bằng chứng | bảng (đã điền số từ `results/block-03/`) | 1 |
| 12 | Evidence | Giới hạn của phép đo và của hệ thống | chữ | 0,75 |
| 13 | Trade-off | Thiếu hàng: báo lỗi giữa hai chặng | dòng Vấn đề / lựa chọn | 0,75 |
| 14 | Trade-off | Field mới `available`: có `optional` hay không | dòng Vấn đề / lựa chọn | 0,75 |
| 15 | Trade-off | Package khi thêm field | dòng Vấn đề / lựa chọn | 0,75 |
| 16 | Trade-off | Quá hạn mà hàng vẫn bị giữ | dòng Vấn đề / lựa chọn | 0,75 |
| 17 | Trade-off | Hai bản Order để so sánh | dòng Vấn đề / lựa chọn | 0,75 |
| 18 | Trade-off | Đo payload | dòng Vấn đề / lựa chọn | 0,75 |
| 19 | | **Q&A** | chữ | tùy |
| P | | Phụ lục | | |

**Tổng khoảng 21 phút nói** (demo gộp một slide). Nếu giới hạn nói là 14 đến 15 phút, cắt theo thứ tự:
1. Gộp slide 2 vào lời dẫn của slide 1 (0,75 phút).
2. Bỏ slide 18 (đo payload) vào lời dẫn của slide Bằng chứng (0,75 phút).
3. Chỉ demo luồng 1 đến 3, chiếu kết quả có sẵn cho luồng 4 đến 7 (khoảng 2 phút).

---

## Cách nhúng sơ đồ (áp dụng cho slide 3, 4, 5, 7, 8, 9)

Mỗi sơ đồ được **nhúng trực tiếp bằng `iframe` vào chính file HTML của archify**, chiếm cả khung slide, để giữ nguyên hover, kéo thả và zoom. Không dùng animation tự phát.

| Tham số | Kết quả quan sát |
|---|---|
| `?theme=light&present=1` | **Dùng cái này.** Presentation Stage: giao diện Light, preset Classic. Còn thanh công cụ (Light, Classic, Exit, Export) và cụm zoom; ẩn các thẻ chú thích bên dưới |
| `?theme=light&embed=1` | Chỉ còn phần sơ đồ, không có nút zoom (dự phòng) |

Slide HTML nằm ở `trinh-bay/`, sơ đồ ở `../so-do/`; mở bằng `file://` là được. **Chưa kiểm chứng bằng thao tác thật:** hover và zoom bằng chuột hoặc bánh xe bên trong `iframe`; nút `Exit` bấm nhầm sẽ thoát Presentation Stage.

---

# Problem (slide 1, 2)

## Slide 1. Bài toán: đặt hàng đi qua hai chặng

**Trên slide:**

- Hai hàng hình ô chữ **Trước** và **Sau**: `Client` → (chặng 1: REST) → `Order` → (chặng 2: REST, rồi gRPC được tô màu cam) → `Inventory`.
- **Phải đạt** (ba điều lấy từ đề):
  1. **API ngoài không đổi** khi đổi giao thức: cùng status và body, cả đường đủ hàng lẫn thiếu hàng.
  2. **Client build từ hợp đồng cũ**, chưa build lại, vẫn đặt hàng được với server mới.
  3. **Inventory chậm hoặc tắt**: request vẫn kết thúc trong thời gian hữu hạn.
- *Câu hỏi của block:* đổi chặng 2 thì chặng 1 có phải đổi theo không? Thêm field vào schema thì client cũ có còn chạy không?

**Lời dẫn (khoảng 1 phút):** "Chúng em không giải thích lại REST và gRPC. Chúng em kể hệ thống làm gì, chúng em đã chọn gì và vì sao, rồi demo để kiểm lại."

---

## Slide 2. Phạm vi: vì sao chỉ đổi chặng 2

**Trên slide:**

1. Chặng 1 có consumer mình không kiểm soát, nên URL, status và body phải giữ nguyên.
2. Trình duyệt không gọi gRPC trực tiếp (cần gRPC-Web và proxy); REST/JSON dùng được từ mọi client và dễ debug.
3. Chặng 2 là nội bộ: Order và Inventory đều nằm trong hệ thống của mình, nên mình quyết định được giao thức ở cả hai đầu.

---

# Solution (slide 3 đến 9)

## Slide 3. Kiến trúc (sơ đồ 01, iframe)

**Hình:** `../so-do/01-kien-truc.html?theme=light&present=1`.

**Điểm nói khi chỉ vào hình** (không ghi chữ lên slide):

1. **Client** (trình duyệt hoặc bên thứ 3) gọi Order; Order có hai kho dữ liệu riêng: `kartvibe_order` (đơn) và `kartvibe_inventory` (tồn kho, do Inventory sở hữu).
2. Có **ba tiến trình Order** từ cùng mã nguồn: `order` (REST), `order-grpc` (gRPC), `order-grpc-v1` (client cũ).
3. `inventory` mở hai cổng: REST 4006 và gRPC 4007; `inventory-grpc-v1` là server cũ, chạy tay khi thử field vắng.

**Tùy chọn:** ba chế độ Guided views của sơ đồ 01 (Chặng ngoài, Chặng trong, Server cũ).

---

## Slide 4. Cơ sở dữ liệu: ba bảng (sơ đồ 11, iframe)

**Hình:** `../so-do/11-er-co-so-du-lieu.html` (không nhận tham số URL), chiếm cả khung. Đây là sơ đồ **vẽ tay bằng SVG**, không phải archify. Mặc định giao diện **sáng** (đã sửa trong file; nút "Chế độ tối" vẫn dùng được, lựa chọn của nút được nhớ theo trình duyệt).

**Lời dẫn:** Inventory có `stock` và `reservations` (database `kartvibe_inventory`); Order có `purchase_orders` (database `kartvibe_order`). Không có khóa ngoại nào: `reservations.sku` tham chiếu `stock.sku` do mã bảo đảm (cập nhật trước khi ghi, cùng transaction); `purchase_orders.reservation_id` chỉ là chuỗi `RSV-<id>` vì hai database khác nhau. Hệ quả: một reservation có thể không có đơn (Order quá hạn mà Inventory vẫn giữ hàng).

**Lưu ý:** file gốc `so-do/11-er-co-so-du-lieu.html` đã bỏ ba thẻ ghi chú bên dưới, chỉ còn sơ đồ (các ghi chú nằm trong lời dẫn).

---

## Slide 5. Một lần đặt hàng đủ hàng, từng bước (sơ đồ 03, iframe)

**Hình:** `../so-do/03-luong-du-hang-grpc.html?theme=light&present=1`, chiếm cả khung. Chữ trên slide gần như không có; các bước nằm ở lời dẫn.

**Mục tiêu:** khán giả nắm luồng thật (đủ hàng, chặng 2 bằng gRPC) trước khi nghe các quyết định.

**Lời dẫn, đi theo các mũi tên từ trên xuống:**

1. Client gửi `POST /orders` `{sku, quantity}` tới Order (kèm `x-request-id`).
2. **Order kiểm hình dạng** body (sai thì 400, không gọi Inventory).
3. Order gọi **Inventory `Reserve`** bằng gRPC, deadline 500 ms.
4. **Inventory kiểm nghiệp vụ** (sku 1 đến 64 ký tự, quantity 1 đến 1000), rồi giữ hàng bằng **một câu `UPDATE ... WHERE available >= quantity` trong một transaction**, rồi ghi `reservations`.
5. Đủ hàng: Order ghi đơn `CONFIRMED` và trả 201. (Hết hàng 409, quá hạn 504, Inventory tắt 503: nói ở phần quyết định.)

**Nói thêm:** mỗi lần đặt hàng để lại **ba dòng log cùng `requestId`** (Order nhận, Order gọi đi, Inventory nhận); đây là cách nối hai chặng khi demo. Giới hạn nói thẳng: mỗi đơn một mặt hàng; không idempotency, không hoàn hàng.

**Lưu ý:** sơ đồ 03 chưa vẽ bước "Inventory kiểm nghiệp vụ" và BEGIN/COMMIT/ROLLBACK (việc tùy chọn đã nêu trước đó). Nếu muốn slide này đúng hoàn toàn với lời dẫn, cần sửa sơ đồ 02, 03, 04 rồi dựng lại bằng `deliver`; chưa làm.

---


> Mỗi slide quyết định theo mẫu: **đã chọn gì, đã không chọn gì, vì sao, cái giá**. Nguồn: ADR 0012 và cột "Đã không chọn và vì sao" trong `PLAN.md`.

## Slide 6. Thêm field mà client cũ không vỡ

**Mục tiêu:** cho người nghe **thấy schema trước**, rồi mới nói về field mới; code rút gọn, chỉ giữ phần thay đổi.

**Trên slide:**

- Hai câu mở: (1) "Giả sử hệ thống cần thêm tính năng cảnh báo sắp hết hàng, Order cần thêm `available` (số lượng còn lại) để báo cho Client hoặc service khác ngay khi số lượng giảm." (2) "Hợp đồng gRPC giữa Order và Inventory là một file `.proto`. Lúc này Inventory cần trả thêm `available` trong `ReserveReply`."
- Hai khối mã cạnh nhau (rút gọn từ `services/proto/inventory/v1` và `v2`, bỏ `ReserveRequest` vì không đổi):

```proto
// Phiên bản 1 (client cũ biết)          // Phiên bản 2 (server mới)
package kartvibe.inventory;              package kartvibe.inventory;

message ReserveReply {                   message ReserveReply {
  string reservation_id = 1;               string reservation_id = 1;
}                                          optional int32 available = 2;
                                         }
```


**Lời dẫn:** "Đây là hợp đồng. Chúng em chỉ thêm một dòng; client cũ không biết số 3 nên bỏ qua."

---

## Slide 7. Client cũ gặp server mới (sơ đồ 09, iframe)

**Hình:** `../so-do/09-luong-client-cu-server-moi.html?theme=light&present=1`.

**Điều nói:** Order cũ gửi `Reserve` kèm `x-client-version: v1`; Inventory (v2) trả reply có thêm field 2; **client v1 không biết tag 2 nên bỏ qua** và vẫn trả 201. Bằng chứng khi demo: log Inventory ghi `clientVersion: v1`, log Order cũ không có `available`.

---

## Slide 8. Cách xử lý khi hết hàng (sơ đồ 04, iframe)

**Hình:** `../so-do/04-luong-het-hang.html?theme=light&present=1`, chiếm cả khung. Chỉ trình bày **cách nhóm đã làm**; lý do chọn và lựa chọn khác nằm ở slide 14.

**Lời dẫn:** Inventory không giữ được hàng thì trả status `FAILED_PRECONDITION` kèm trailing metadata `x-error-code: OUT_OF_STOCK` (gRPC có tập status code cố định nên mã nghiệp vụ đi bằng metadata). Order đọc metadata và trả 409 `OUT_OF_STOCK` cho Client, giống đường REST. Không giữ hàng, không tạo đơn.

---

## Slide 9. Cách xử lý khi Inventory chậm hoặc tắt (sơ đồ 06, iframe)

**Hình:** `../so-do/06-luong-inventory-cham-qua-han.html?theme=light&present=1`, chiếm cả khung. Chỉ trình bày **cách nhóm đã làm**; lựa chọn và cái giá nằm ở slide 17.

**Lời dẫn:**
1. Order đặt deadline **500 ms**. Inventory chậm thì Order trả 504 `INVENTORY_TIMEOUT` sau khoảng 0,5 giây; Inventory tắt thì Order trả 503 (`UNAVAILABLE`); dữ liệu sai thì 400.
2. Sơ đồ cho thấy hệ quả: Order đã bỏ cuộc nhưng Inventory vẫn xử lý xong sau khoảng 2 giây, trừ tồn kho và ghi `reservations`. Đây là câu trả lời cho câu hỏi của đề: "Reserve đã chạy hay chưa khi quá hạn?": **có thể đã chạy**.

**Lưu ý:** sơ đồ chỉ vẽ trường hợp chậm; trường hợp tắt (503) và bật lại nằm ở phụ lục (sơ đồ 07, 08) và nói bằng lời. Nút "Trình duyệt" trong sơ đồ vẫn là tên cũ (chưa đổi thành "Client").

---

# Demo (slide 10)

## Slide 10. Demo: các luồng sẽ chạy

Slide là **bảng liệt kê 7 luồng** (theo yêu cầu của đề), một cột duy nhất, không có thao tác từng bước; **6 luồng chính** in đậm (luồng 1 đến 6) là luồng nên demo trực tiếp.

| # | Luồng |
|---|---|
| 1 | **Đủ hàng, status và body của API ngoài không đổi trước và sau khi đổi sang gRPC** |
| 2 | **Client cũ (build từ proto cũ) với server mới: field mới không được đọc nhưng không lỗi** |
| 3 | **Client mới với server mới: field mới được đọc đúng** |
| 4 | **Thiếu hàng (không thành 500 tùy tiện, ánh xạ sang response ngoài)** |
| 5 | **Inventory chậm: request kết thúc trong thời gian hữu hạn** |
| 6 | **Inventory tắt: request kết thúc trong thời gian hữu hạn** |
| 7 | Client mới với server cũ (trả về thiếu field) |

**Gợi ý thao tác khi demo (không để trên slide):** luồng 1, 2, 3 cùng một lần bấm "Đặt hàng" ở ba cột (REST, gRPC, client cũ), nhìn khung "Bên trong (từ log)": client cũ có `v1` và không có `available`, gRPC có `available` là số. Luồng 4: "Hết hàng", cùng 409, log `rest 409` so với `FAILED_PRECONDITION`. Luồng 5: "Làm chậm 2000 ms", "Đặt hàng", "Làm mới log" (504 sau khoảng 0,5 s, dòng Inventory tới muộn). Luồng 6: dừng Inventory (503). Luồng 7: dừng Inventory, chạy `inventory-grpc-v1`, log `available` là `absent`.

**Lưu ý khi demo:** UI `order-compare.html` có ba cột (REST, gRPC, client cũ), mỗi cột có khung "Bên trong (từ log)"; nạp lại tồn kho trước mỗi lần (ba cột trừ chung, `SKU-OK` chỉ có 10); sau khi bật lại Inventory chờ vài giây vì kênh gRPC còn backoff; chạy web bằng `ENABLE_TEST_HOOKS=1 npm start`; Docker và Postgres chạy trước; chuẩn bị ca dự phòng nếu Docker lỗi.

**Luồng 5 và 6:** đề yêu cầu bằng chứng (timestamp, status, response ngoài), không bắt buộc demo trực tiếp; nếu thiếu giờ có thể chiếu `results/block-03/errors/`.

---

# Evidence (slide 11 và 12)

## Slide 11. Bằng chứng (bảng)

| Điều khẳng định | Bằng chứng | Kết quả |
|---|---|---|
| API ngoài không đổi khi đổi giao thức | snapshot status và body, REST so gRPC so gRPC cũ | … |
| Chặng trong thật sự là gRPC | log theo `requestId`: `protocol`, `grpcStatus`, `clientVersion` | … |
| Thêm field không làm vỡ client cũ | diff proto (chỉ thêm tag 2); `verify-frozen`; `compat` | … |
| Field vắng được xử lý đúng | `available` có mặt (kể cả 0) hoặc `"absent"` | … |
| Lỗi và thời gian hữu hạn | 504 khi chậm, 503 khi tắt, kèm thời gian | … |
| Payload (message đã serialize, **lớp 1**) | request và reply, JSON so Protobuf | … |

**Lời dẫn:** "Số liệu là số chạy thật của nhóm, kèm lệnh và thời điểm. Payload đo cùng một lớp cho cả hai bên." **Cần chuẩn bị:** chạy `chay-lai.sh` và điền bảng.

---

## Slide 12. Giới hạn của phép đo và của hệ thống

Đề yêu cầu ghi "trade-off và giới hạn của phép đo". Nguồn: `REPORT.md` mục 7.

**Phép đo:**
- Một máy, `localhost`, dữ liệu nhỏ: chênh lệch nhỏ giữa REST và gRPC không đủ để kết luận về hiệu năng.
- Ít mẫu (tối thiểu 5, đề xuất của bài tập); lần đầu mỗi cổng gồm cả chi phí kết nối.
- Payload đo ở **lớp 1** (message đã serialize); không đo header HTTP, không so khác lớp.
- Thời gian trên trang demo đo ở trình duyệt, chỉ để tham khảo.

**Hệ thống:** mỗi đơn một mặt hàng; không có idempotency, không hoàn hàng khi quá hạn.

---

# Trade-off (slide 13 đến 18)

Sáu quyết định quan trọng, trình bày **dạng dòng** (không dùng bảng): mỗi slide có **Vấn đề**, rồi **Các lựa chọn**; mỗi lựa chọn có dòng `+` ưu điểm và dòng `−` nhược điểm. Lựa chọn A (nền xanh) là cái đã chọn, B (nền vàng) là cái không chọn. Nội dung đầy đủ và các quyết định còn lại nằm ở `TRADE-OFFS.md`; các quyết định sẽ được ghi rõ trong báo cáo.

## Slide 13. Thiếu hàng: báo lỗi giữa hai chặng

**Vấn đề:** Báo "hết hàng" từ Inventory sang Order để Client vẫn nhận 409 ở cả REST và gRPC.

- **A. gRPC: `FAILED_PRECONDITION` kèm metadata `x-error-code: OUT_OF_STOCK`; REST: 409 (đã chọn)**
  + Đối xứng với REST 409; dùng cơ chế lỗi của gRPC; reply chỉ chứa dữ liệu khi thành công
  − Phải tự quy ước thêm khóa `x-error-code` (gRPC không có mã `OUT_OF_STOCK`)
- **B. Trả thành công, báo hết hàng bằng field trong reply (ví dụ `reserved=false`)**
  + Không cần quy ước khóa metadata tự đặt; mọi thứ nằm trong reply
  − Reply phải có thêm field trạng thái; hai đường xử lý hai kiểu; lỗi lẫn với thành công (status vẫn `OK`)

---

## Slide 14. Field mới `available`: có `optional` hay không

**Vấn đề:** Làm sao phân biệt `available = 0` (còn 0 hàng) với trường hợp server không gửi `available`?

- **A. `optional`; khi vắng thì ghi `absent`, không suy ra 0 (đã chọn)**
  + Phân biệt được "bằng 0" và "không có thông tin"
  − Client phải xử lý thêm trường hợp vắng
- **B. Không `optional`, vắng được hiểu là 0**
  + Đơn giản
  − Server cũ bị hiểu thành "hết hàng"

---

## Slide 15. Package khi thêm field

**Vấn đề:** Phiên bản 2 đặt ở package nào để client cũ vẫn chạy.

- **A. Giữ nguyên package cho cả hai phiên bản (đã chọn)**
  + Địa chỉ lời gọi không đổi, client cũ vẫn gọi được
  − Tương thích wire chưa chắc tương thích nghiệp vụ
- **B. Đặt phiên bản 2 ở package khác**
  + Tách hẳn hai phiên bản
  − Client cũ không gọi được (đã thử); phải chạy song song hai package

---

## Slide 16. Quá hạn mà hàng vẫn bị giữ

**Vấn đề:** Order đặt deadline 500 ms rồi bỏ cuộc, nhưng Inventory vẫn xử lý xong và giữ hàng.

- **A. Deadline 500 ms, không bù trừ, chỉ ghi log (đã chọn)**
  + Mọi request kết thúc trong thời gian hữu hạn; đơn giản, đúng phạm vi bài
  − Hàng bị giữ mà không có đơn, và không có cách nhả
- **B. Bù trừ (hoàn hàng) hoặc idempotency**
  + Không để hàng bị giữ vô ích
  − Cần cơ chế bù trừ và idempotency; ngoài phạm vi (Block 7 và 9)

---

## Slide 17. Hai bản Order để so sánh

**Vấn đề:** Khác biệt giữa REST và gRPC ở chặng 2 phải chỉ do giao thức.

- **A. Hai tiến trình Order cùng mã nguồn, chọn giao thức lúc khởi động (đã chọn)**
  + Khác biệt chỉ do giao thức; log tách theo tên tiến trình
  − Nhiều tiến trình, dùng chung database nên kịch bản phải chạy tuần tự
- **B. Một bản Order, chọn giao thức theo từng request (flag)**
  + Chỉ một tiến trình
  − Thêm đường điều khiển ẩn vào API ngoài, vi phạm nguyên tắc giữ nguyên chặng 1

---

## Slide 18. Đo payload

**Vấn đề:** So sánh kích thước dữ liệu REST và gRPC bằng đại lượng nào cho công bằng.

- **A. Lớp 1: message đã serialize (JSON body so với message Protobuf) (đã chọn)**
  + Cùng một đại lượng cho cả hai bên, đúng yêu cầu của đề
  − Không phải byte trên dây (không có header, khung HTTP/2)
- **B. Wire bytes (lớp 3)**
  + Sát thực tế mạng
  − Header HTTP/1.1 và HTTP/2 làm chênh lệch khó diễn giải; cần bắt gói

---

## Phụ lục (mỗi sơ đồ một slide, `?theme=light&present=1`)

| Phụ lục | File | Dùng khi bị hỏi |
|---|---|---|
| P1 | 02 (đủ hàng qua REST; 03 đã ở slide 5) | "REST khác gRPC ở chặng trong chỗ nào?": mở 02 đối chiếu với slide 5 |
| P2 | 05 (dữ liệu sai, validate hai tầng) | vì sao Order không chặn mọi thứ |
| P3a, P3b | 07 (Inventory tắt) và 08 (bật lại) | độ trễ hồi phục của gRPC |
| P4 | 10 (client mới, server cũ) | field vắng thì sao; đi cặp với slide 7 |

---

## Đã chốt và còn cần bạn quyết

**Đã chốt:** năm sơ đồ chính (01, 11, 03, 09, 06), mỗi cái một slide, nhúng bằng `iframe`; thứ tự đúng yêu cầu của đề (Problem, Solution, Demo, Evidence, Trade-off); slide mang nhãn năm phần của đề (Problem, Solution, Trade-off, Demo, Evidence); khung log trên UI dùng để chứng minh chặng trong.

**Còn cần bạn quyết:**

1. **Giới hạn thời gian nói thật** là bao nhiêu? Bản này khoảng 19 phút; nếu chỉ 14 đến 15 phút thì áp các cắt giảm ở trên.
2. Có sửa sơ đồ 02, 03, 04 để thêm bước kiểm nghiệp vụ và BEGIN/COMMIT/ROLLBACK không? (Slide 5 đang nhắc các bước này trong lời dẫn.)
3. **Công nghệ slide:** một file HTML tự đứng (đang dùng) hay PowerPoint (không nhúng được `iframe`)?
4. **Ai nói phần nào** (nhóm 5 người; gợi ý chia theo năm phần của đề).
5. **Demo:** chạy trực tiếp 6 luồng chính (1 đến 6; luồng 6 dùng nút Tắt Inventory trên UI) và 7 (đề ghi là tùy chọn, "nếu còn thời gian")?
6. Các ô `…` ở slide 11: bạn chạy `chay-lai.sh` trước, hay để trống.
