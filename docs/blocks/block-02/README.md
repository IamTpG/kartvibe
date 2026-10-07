# Block 2: API Composition (REST, BFF, GraphQL)

> **Đây là ghi chú chuẩn bị, chưa phải bản chụp nộp bài.** Nội dung dựa trên phần tóm tắt trong kế hoạch môn học; yêu cầu chi tiết của giảng viên có thể khác.

## Trạng thái xác nhận

| Điều chưa rõ | Đã xác nhận với giảng viên? |
|---|---|
| User, Order, Product Service có sẵn trong dự án học kỳ hay nhóm tự dựng | chưa |
| Chọn BFF hay GraphQL, hay phải làm cả hai | chưa |
| Dashboard hiển thị những gì, dữ liệu mẫu ra sao | chưa |
| Công cụ đo nào được dùng làm bằng chứng | chưa |

## Kế hoạch ghi gì

- **Chủ đề:** tổng hợp dữ liệu cho dashboard bằng BFF hoặc GraphQL.
- **Bài thực hành:** dashboard gọi User, Order, Product Service tuần tự. Xây BFF hoặc GraphQL để tổng hợp; với GraphQL, phát hiện và sửa N+1.
- **Bằng chứng:** so sánh trước/sau về số request từ browser, số query DB, số lần gọi service và thời gian; giải thích vì sao chọn BFF hoặc GraphQL.
- **Kết luận kỹ thuật:** giảm request từ browser chưa chắc giảm query backend; GraphQL không mặc định tốt hơn REST.

## Kịch bản phỏng đoán (chưa xác nhận)

Dashboard của một người dùng cần: thông tin người dùng (User Service), các đơn hàng gần đây (Order Service), và thông tin sản phẩm trong các đơn đó (Product Service). Nếu viết ngây thơ, trình duyệt gọi tuần tự: user → orders → với mỗi order/item gọi product. Đó là điều bài thực hành muốn bạn thấy và sửa.

## Sân thử để thực hành

Có sẵn một baseline "chậm có chủ đích" (User, Order, Product Service và một dashboard gọi tuần tự) để tự đo bốn chỉ số trước khi làm BFF hoặc GraphQL: xem [services/README.md](../../../services/README.md). Kịch bản này là phỏng đoán, không phải yêu cầu của giảng viên.

## Khái niệm

| Khái niệm | Ý nghĩa |
|---|---|
| Waterfall (browser) | Các request nối tiếp nhau vì request sau cần kết quả của request trước. Thấy trong cột Waterfall của tab Network |
| Fan-out | Một yêu cầu ở trên làm phát sinh nhiều lời gọi xuống dưới (ví dụ BFF gọi 3 service) |
| Over-fetch / under-fetch | Over: nhận nhiều field hơn cần. Under: một endpoint không đủ dữ liệu nên phải gọi thêm |
| N+1 | Một truy vấn lấy N phần tử, rồi N truy vấn nữa, mỗi cái cho một phần tử (1 + N) |
| BFF (Backend for Frontend) | Một lớp backend riêng cho một giao diện, gom và định hình dữ liệu từ nhiều service |
| GraphQL | Một endpoint, client mô tả field cần lấy; server chạy resolver cho từng field |

### Hai chỉ số hay bị nhầm
- **Số request từ browser** và **số truy vấn DB** là hai thứ khác nhau. BFF làm giảm số request từ browser (3 thành 1) nhưng nếu BFF vẫn gọi service tuần tự và mỗi service vẫn truy vấn từng phần tử thì số truy vấn DB **không đổi**, thậm chí có thể lệch.
- Vì vậy kết luận của block là: giảm request ở browser chưa chắc giảm query backend. Phải đo cả hai.

## BFF và GraphQL

| | BFF | GraphQL |
|---|---|---|
| Cách làm | Viết một endpoint riêng cho dashboard (ví dụ `GET /bff/dashboard`) gọi nhiều service rồi trả một cục dữ liệu | Định nghĩa schema; client viết query chọn field |
| Gọi song song hay tuần tự | Bạn quyết định (nên gọi song song những phần không phụ thuộc nhau) | Tuỳ resolver; dễ vô tình tạo N+1 |
| Over/under-fetch | Giải quyết bằng cách thiết kế endpoint theo màn hình | Client tự chọn field |
| Rủi ro | Mỗi màn hình có thể cần endpoint riêng | N+1; truy vấn quá sâu hoặc quá nặng; khó cache HTTP |
| Khi hợp | Ít màn hình, dữ liệu ổn định | Nhiều client, nhu cầu dữ liệu khác nhau |

### N+1 trong GraphQL (cơ chế)
Query lấy 20 order, mỗi order có field `product`. Nếu resolver của `product` tự truy vấn DB theo `productId`, ta có 1 truy vấn lấy order + 20 truy vấn lấy product = 21. Cách sửa phổ biến là **batching** (DataLoader): gom các id cần trong cùng một lượt xử lý thành một truy vấn `WHERE id IN (...)`, còn 2 truy vấn. Lưu ý loader thường được tạo **mỗi request**, để không dùng chung cache giữa người dùng khác nhau.

## Cách đo (chuẩn bị trước, không phụ thuộc kịch bản)

| Chỉ số | Cách đo gợi ý |
|---|---|
| Số request từ browser | Tab Network của DevTools: tắt cache (Disable cache), xem số request và cột Waterfall |
| Số truy vấn DB | Bật log truy vấn (Prisma `log` hoặc Postgres `log_statement`), hoặc `pg_stat_statements`; đếm trong một lần tải dashboard |
| Số lần gọi service | Ghi log mỗi lời gọi đi ra, kèm `request_id`, rồi đếm theo `request_id` |
| Thời gian | Thời gian tải toàn trang trong DevTools; với service giả lập dùng độ trễ cố định để so sánh công bằng |

### Bảng ghi kết quả

| Chỉ số | Trước | Sau (BFF) | Sau (GraphQL, chưa sửa N+1) | Sau (GraphQL, đã sửa) |
|---|---:|---:|---:|---:|
| Request từ browser | | | | |
| Truy vấn DB | | | | |
| Lần gọi service | | | | |
| Thời gian (ms) | | | | |

## Câu hỏi tự kiểm tra

1. Vì sao BFF có thể giảm request ở browser mà không giảm truy vấn DB?
2. N+1 xảy ra thế nào, và batching đổi số truy vấn từ bao nhiêu thành bao nhiêu?
3. Khi nào bạn chọn BFF, khi nào GraphQL? Nêu một lý do chống lại mỗi lựa chọn.
4. Vì sao loader nên tạo theo từng request?

<details><summary>Gợi ý trả lời</summary>

1. BFF gom nhiều request của browser thành một, nhưng bên trong nó vẫn gọi service. Nếu mỗi lần gọi service vẫn sinh truy vấn riêng cho từng phần tử, số truy vấn không đổi.
2. Resolver con chạy một lần cho mỗi phần tử cha: 1 truy vấn cha + N truy vấn con. Batching gom thành 1 truy vấn con, tổng còn 2.
3. BFF hợp khi ít màn hình và dữ liệu rõ ràng, nhưng dễ phát sinh nhiều endpoint theo màn hình. GraphQL hợp khi nhiều client cần dữ liệu khác nhau, nhưng có rủi ro N+1, truy vấn nặng và khó cache.
4. Loader có cache theo id; dùng chung giữa các request có thể rò rỉ dữ liệu giữa người dùng hoặc giữ dữ liệu cũ.
</details>

## Checklist khi duyệt kết quả của agent
- [ ] Có số liệu **trước** và **sau**, đo bằng cùng một cách và cùng dữ liệu?
- [ ] Số truy vấn DB được đo, không chỉ số request browser?
- [ ] Các lời gọi độc lập đã chạy song song chưa?
- [ ] Với GraphQL: N+1 còn hay đã hết? Bằng chứng là gì (đếm truy vấn)?
- [ ] Giải thích được vì sao chọn BFF hoặc GraphQL, và giới hạn của lựa chọn đó?

## Chuẩn bị trước (không phụ thuộc yêu cầu thật)
- [ ] Đọc khái niệm trên và tự trả lời 4 câu hỏi.
- [ ] Thử đo một trang bất kỳ bằng DevTools Network.
- [ ] Chạy thử một GraphQL server tối giản trên máy (không gắn vào dự án).

---

# Kiến thức đã học (tự tổng hợp)

> Tổng hợp sau khi tự học và đo trên sân thử `services/`. Chưa xác nhận với giảng viên. Phần cài đặt BFF/GraphQL **chưa làm**, sẽ giao cho coding agent khi làm bài trên lớp.

## 1. Vấn đề ban đầu và cách đo

Dashboard gọi tuần tự `user → orders → product (mỗi item một lần)`. Với dữ liệu mặc định (20 đơn × 3 item):

| Chỉ số | Giá trị | Giải thích |
|---|---:|---|
| Request từ browser (`measure.mjs`) | 62 | 1 (user) + 1 (orders) + 60 (product) |
| Truy vấn DB | 63 | 1 + 2 (order: đơn rồi item) + 60 |
| Lần gọi service | 62 | bằng số request vì browser gọi thẳng service |
| Thời gian (độ trễ 50 ms) | ~3414 ms | 62 × (50 + ~5 ms xử lý) |

- Trên tab Network của Chrome thấy **69 request**: 62 + 7 request thừa của chính trang (1 tải HTML, 3 `reset`, 3 `GET /_metrics`). Khi so sánh trước/sau phải dùng **cùng một định nghĩa**, nên lấy số của `measure.mjs`.
- Đổi quy mô thì số liệu **tăng tuyến tính**: 40 đơn → 122 / 123 / 122 request, ~6653 ms (trên browser: 129 request).
- Đổi độ trễ chỉ làm **thời gian** tăng, số request không đổi: 100 ms → ~12 789 ms (≈ 122 × 105). Tỉ lệ 1,92 chứ không đúng 2 vì phần xử lý cố định vài ms không tăng theo độ trễ giả.
- Kết luận: thời gian ở đây phụ thuộc chủ yếu vào **số lời gọi tuần tự × độ trễ mỗi lời gọi**, không phải khối lượng công việc DB. Đó là lý do waterfall là vấn đề.

## 2. BFF

- Là một **lớp (hoặc service)** phục vụ một giao diện cụ thể, gom và định hình dữ liệu từ nhiều nguồn, đứng giữa client và các service.
- **Không** được định nghĩa bởi số endpoint. Một endpoint cho cả trang và một endpoint cho mỗi widget đều là BFF hợp lệ:
  - Một endpoint cho cả trang: ít request nhất, nhưng một phần chậm hoặc lỗi dễ kéo cả trang.
  - Mỗi widget một endpoint: song song được, lỗi độc lập, cache theo phần, nhưng nhiều request hơn.
- Nếu các endpoint `/dashboard/...` chỉ truy vấn một DB của cùng backend thì chúng chỉ là endpoint báo cáo thông thường, chưa hẳn là BFF.
- **Cái bẫy:** BFF vẫn gọi Product 120 lần thì browser chỉ còn 1 request nhưng số lần gọi service và số truy vấn DB **không giảm**.

## 3. GraphQL: xử lý một truy vấn

1. **Parse**: chuỗi query thành cây (AST).
2. **Validate**: so với schema; sai thì trả lỗi, **không chạy resolver nào**.
3. **Execute**: đi từ gốc xuống, gọi resolver của từng field; với danh sách, resolver con chạy **một lần cho mỗi phần tử**. Mỗi resolver nhận (dữ liệu cha, tham số, `context`).
4. **Lắp kết quả** đúng hình dạng query; field lỗi thành `null` và lỗi ghi vào mảng `errors` (kết quả một phần).

- **N+1**: resolver `product` chạy 60 lần, mỗi lần một lời gọi, cộng 1 lần lấy đơn.
- **DataLoader (batching)**: `load(id)` không gọi ngay mà gom id trong cùng một lượt xử lý, rồi gọi **một** lần (`IN (...)`), bỏ id trùng, trả kết quả đúng thứ tự. Tạo loader **mới cho mỗi request** để không dùng chung cache giữa các người dùng.
- Điều kiện: service phải có cách lấy nhiều id một lúc. Nếu không, thêm DataLoader cũng không giảm được số lời gọi.
- Rủi ro khác: query quá sâu/nặng (cần giới hạn độ sâu và độ phức tạp); thường chỉ có `POST /graphql` nên khó cache HTTP.

## 4. Bản chất: join ở tầng ứng dụng

- Mỗi service sở hữu dữ liệu riêng, không có khóa ngoại giữa chúng, nên không thể `JOIN` trong DB. Lớp gom phải **join bằng mã** ("API Composition").
- Đối chiếu với các kiểu join: N+1 giống vòng lặp lồng nhau; batching giống tra theo danh sách `IN (...)`; dedupe là bỏ khóa trùng.
- Cái giá: chậm hơn join trong DB (có độ trễ mạng), không có giao dịch bao trùm, khó lọc/sắp xếp/phân trang xuyên service, và phải quyết định khi một service lỗi.
- Truy vấn thẳng DB của service khác là có thể làm nhưng không nên, vì phá ranh giới sở hữu dữ liệu.

## 5. Mục đích của BFF và GraphQL (đã chỉnh)

- Giảm số request từ client đến **lớp gom** (không phải số lời gọi xuống service).
- Ẩn cấu trúc và logic bên trong khỏi client; định hình dữ liệu cho đúng nhu cầu (tránh over/under-fetch).
- **Không tự giảm** công việc phía sau. Muốn giảm số lời gọi service và truy vấn DB cần cả hai: service cung cấp cách lấy nhiều bản ghi, và lớp gom biết gom id, bỏ trùng, gọi song song.
- Với GraphQL, N+1 là rủi ro do mô hình resolver gây ra; BFF/GraphQL chỉ tạo ra **chỗ** để sửa nó.
- Một process thì vẫn có thể có "lớp tổng hợp", nhưng lời gọi giữa các phần là gọi hàm và có thể dùng `JOIN` SQL, nên phần lớn vấn đề của block này không xuất hiện.

> Tóm tắt một câu: *BFF/GraphQL gom nhiều lời gọi của client thành một và che cấu trúc bên trong; chúng không tự giảm công việc phía sau, nên phải chủ động gom id, gọi song song và dùng endpoint lấy nhiều bản ghi.*

## 6. Ghi chú công cụ
- Cột **Waterfall** hiện mặc định trong tab Network của Chrome. Firefox khó tìm hơn; có thể thay bằng các cột Start/End/Duration.

## 7. Còn lại cho buổi học
- [ ] Bảng dự đoán BFF/BFF + batch/dedupe chưa điền (xem lịch sử trao đổi); điền trước hoặc ngay trên lớp.
- [ ] Giao agent: làm BFF và/hoặc GraphQL; thêm chế độ vào `services/measure.mjs`; so sánh với baseline.
- [ ] Tự kiểm chứng bằng checklist ở trên: có số trước/sau, đo cả truy vấn DB, gọi song song, N+1 đã hết (đếm truy vấn), giải thích được lựa chọn và giới hạn.
