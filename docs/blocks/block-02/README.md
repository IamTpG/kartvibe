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
