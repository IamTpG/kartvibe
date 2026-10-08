# Sơ đồ kiến trúc và quyết định (Block 2)

Dùng để trình bày. Xem trực tiếp trên GitHub hoặc bản xem trước Markdown của VS Code (có Mermaid), hoặc mở `so-do-kien-truc.html` trong trình duyệt (cần internet để tải thư viện Mermaid).

## 1. Kiến trúc tổng quan

```mermaid
flowchart LR
    subgraph C["Trình duyệt: cùng dữ liệu, hai trang"]
        W["Web dashboard<br/>đủ trường"]
        M["Mobile<br/>chỉ mã đơn, trạng thái,<br/>tên và thumbnail"]
    end

    subgraph L["Lớp ghép dữ liệu"]
        BFF["BFF :4004<br/>/bff/web/dashboard<br/>/bff/mobile/orders"]
        GQL["GraphQL :4005<br/>POST /graphql<br/>query Web, Mobile"]
    end

    subgraph S["Ba service, mỗi service một database riêng"]
        U["User :4001"] --- DU[("kartvibe_user")]
        O["Order :4002"] --- DO[("kartvibe_order")]
        P["Product :4003<br/>GET /products/:id<br/>GET /products?ids="] --- DP[("kartvibe_product")]
    end

    C -. "Baseline: gọi trực tiếp, tuần tự" .-> S
    C -- "1 request" --> BFF
    C -- "1 request" --> GQL
    BFF --> S
    GQL --> S
```

**Điều cần nói:** ba đường đi từ cùng một trình duyệt đến cùng ba service. Khác biệt duy nhất là **nơi ghép dữ liệu**: ở client (baseline), ở BFF, hoặc ở GraphQL. BFF và GraphQL chỉ gọi service qua REST, không đụng vào database.

## 2. Baseline: trình duyệt gọi tuần tự (dữ liệu S: 17 request)

```mermaid
sequenceDiagram
    autonumber
    participant B as Trình duyệt
    participant U as User
    participant O as Order
    participant P as Product
    B->>U: GET /users/1
    U-->>B: tên người dùng
    B->>O: GET /orders?userId=1
    O-->>B: 5 đơn, 15 item
    loop 15 lần, mỗi item một lần, nối tiếp
        B->>P: GET /products/:id
        P-->>B: một product
    end
    Note over B,P: 1 + 1 + 15 = 17 request nối tiếp.<br/>Waterfall bậc thang. Client tự ghép.
```

## 3. BFF: gom ở server (1 request từ client)

```mermaid
sequenceDiagram
    autonumber
    participant B as Trình duyệt
    participant F as BFF
    participant U as User
    participant O as Order
    participant P as Product
    B->>F: GET /bff/web/dashboard?userId=1
    par User và Order gọi song song
        F->>U: GET /users/1
        U-->>F: người dùng
    and
        F->>O: GET /orders?userId=1
        O-->>F: 5 đơn, 15 item
    end
    Note over F: Gom id product và loại trùng
    F->>P: GET /products?ids=... (MỘT lần)
    P-->>F: các product, 1 truy vấn DB
    F-->>B: JSON dashboard (1 response)
    Note over B,P: Client 1 request. Product 1 lời gọi, 1 truy vấn.<br/>Mobile: không gọi User.
```

## 4. GraphQL: N+1 và cách sửa

```mermaid
sequenceDiagram
    autonumber
    participant B as Trình duyệt
    participant G as GraphQL
    participant O as Order
    participant P as Product
    B->>G: POST /graphql (1 request, query Web hoặc Mobile)
    G->>O: GET /orders?userId=1
    O-->>G: 5 đơn, 15 item
    Note over G: Resolver product chạy cho từng item
    alt DataLoader TẮT (ngây thơ): N+1
        loop 15 lần
            G->>P: GET /products/:id
            P-->>G: một product
        end
        Note over G,P: Client chỉ 1 request nhưng Product nhận 15 lời gọi, 15 truy vấn
    else DataLoader BẬT (đã sửa)
        Note over G: Gom id trong cùng một request, loại trùng
        G->>P: GET /products?ids=... (MỘT lần)
        P-->>G: các product
        Note over G,P: Product nhận 1 lời gọi, 1 truy vấn
    end
    G-->>B: JSON theo đúng hình dạng query
```

**Điều cần nói:** giảm request ở browser **chưa** đồng nghĩa giảm truy vấn ở backend. GraphQL ngây thơ chứng minh điều đó.

## 5. Chính sách lỗi (BFF và GraphQL giống nhau)

```mermaid
flowchart TD
    A["Lớp ghép gọi Product"] --> B{"Product lỗi 500<br/>hoặc quá 1000 ms?"}
    B -- "Không" --> C["Dữ liệu đầy đủ<br/>partial = false"]
    B -- "Có" --> D["Các product bị ảnh hưởng = null<br/>partial = true, errors = PRODUCT_UNAVAILABLE<br/>KHÔNG điền tên hoặc giá giả"]
    D --> E["Màn hình vẫn dùng được<br/>dòng thiếu hiện dấu gạch"]
    A --> F{"User hoặc Order lỗi?"}
    F -- "Có" --> G["Lỗi toàn bộ<br/>BFF: 502 UPSTREAM_ERROR"]
    H["Baseline: client gọi từng Product"] --> I["Một lỗi là hỏng cả lượt tải<br/>không có cơ chế một phần"]
```

## 6. Bản đồ quyết định: vấn đề → quyết định → kết quả

```mermaid
flowchart LR
    P1["Waterfall ở client<br/>nhiều request nối tiếp"] --> D1["Ghép ở server:<br/>BFF hoặc GraphQL"] --> E1["Client 1 request"]
    P2["Product nhận quá nhiều lời gọi"] --> D2["Endpoint lấy nhiều id<br/>và loại trùng"] --> E2["Product 1 lời gọi<br/>1 truy vấn DB"]
    P3["GraphQL tự sinh N+1"] --> D3["DataLoader<br/>tạo mới mỗi request"] --> E2
    P4["Một service lỗi hoặc chậm"] --> D4["Trả một phần,<br/>timeout 1000 ms,<br/>không giá trị giả"] --> E4["Màn hình vẫn dùng được"]
    P5["So sánh phải công bằng"] --> D5["Cùng cách đếm, cùng dữ liệu,<br/>lạnh và ấm, 5 lần"] --> E5["Số liệu so sánh được"]
```

## 7. Luồng đo và bằng chứng

```mermaid
flowchart LR
    R["restart-cold.sh<br/>khởi động lại lạnh"] --> PG["Trang đo trong trình duyệt<br/>1 lạnh + 5 ấm"]
    PG -- "mỗi lần chạy" --> CO["Bộ thu kết quả :4010"]
    PG -. "đọc bộ đếm" .-> MT["/_metrics của từng service"]
    CO --> RAW["results/raw"]
    RAW --> REP["report.mjs"] --> MD["results/evidence/<br/>measurements.md"]
    LOG["services/logs<br/>stdout từng service (start-all.sh ghi), theo requestId"] --> TR["export-trace.mjs"] --> EV["results/evidence/<br/>trace N+1, call graph"]
```

## 8. DataLoader bên trong: vì sao gom được

DataLoader **không chạm DB**. Nó chỉ làm cho lớp ghép gửi **một lô** thay vì 15 lời gọi lẻ. DB nhẹ đi vì lô đó chỉ tốn một câu SQL nhờ endpoint lấy nhiều của Product.

```mermaid
sequenceDiagram
    autonumber
    participant R as 15 resolver product
    participant L as DataLoader
    participant H as Hàm gom
    participant P as Product Service
    participant D as Postgres
    R->>L: load(8), load(9), ..., load(8)
    Note over R,L: 15 lần gọi trong cùng một nhịp.<br/>Chưa gọi đi đâu. Mỗi lần trả về một Promise đang chờ.
    Note over L: Id trùng dùng chung một Promise.<br/>S: 15 item còn 10 id khác nhau.
    Note over L: Hết nhịp, lấy mọi id trong hàng đợi
    L->>H: batch của 10 id
    H->>P: GET /products?ids=... (MỘT lời gọi)
    P->>D: SELECT ... WHERE id = ANY(...) (MỘT truy vấn)
    D-->>P: 10 dòng
    P-->>H: các product
    H-->>L: danh sách đúng thứ tự id đã xin
    L-->>R: giải quyết 15 Promise, mỗi resolver nhận đúng product
```

### Trước và sau khi gom

| | Không DataLoader | Có DataLoader |
|---|---|---|
| GraphQL gọi Product (S: 15 item) | 15 lời gọi | **1 lời gọi** (10 id khác nhau) |
| Product truy vấn Postgres (S) | 15 câu `WHERE id = $1` | **1 câu** `WHERE id = ANY($1)` |
| GraphQL gọi Product (L: 200 item) | 200 lời gọi | **1 lời gọi** (30 id khác nhau) |
| Product truy vấn Postgres (L) | 200 câu | **1 câu** |

### Đoạn mã cốt lõi (`services/graphql/src/schema.ts`)

```ts
const loader = new DataLoader(async (ids) => {
  const list = await getProducts(ids, requestId);     // MỘT lời gọi: /products?ids=...
  const byId = new Map(list.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id) ?? null);       // trả đúng thứ tự id đã xin
});
// resolver của OrderItem.product:  return loader.load(item.productId)
```

### Hai lưu ý
- **Loader tạo mới cho mỗi request:** cache id chỉ sống trong một request, không rò dữ liệu giữa người dùng hoặc giữ dữ liệu cũ.
- **Giới hạn kích thước lô:** hợp đồng cho phép tối đa 200 id mỗi lần và loader hiện không tách lô; có hơn 200 id khác nhau thì Product trả `400`. Dữ liệu S và L (10 và 30 id) không gặp vấn đề này.

**Một câu để nhớ:** DataLoader đổi "N lời gọi nhỏ" thành "1 lời gọi lớn" bằng cách chờ một nhịp để gom id; DB nhẹ đi vì lời gọi lớn đó chỉ tốn một câu SQL.
