# Call graph nội bộ của BFF (dữ liệu L)

Một request `GET /bff/web/dashboard?userId=1` với `x-request-id: callgraph-bff-L-1791469000919`. Các dòng log cùng `requestId` ở từng service:

| Service | Số lời gọi |
|---|---:|
| user | 1 |
| order | 1 |
| product | 1 |

```
[bff] {"ts":"2026-10-08T14:16:42.356Z","service":"bff","requestId":"callgraph-bff-L-1791469000919","method":"GET","path":"/bff/web/dashboard","status":200,"ms":113}
[user] {"ts":"2026-10-08T14:16:42.311Z","service":"user","requestId":"callgraph-bff-L-1791469000919","method":"GET","path":"/users/1","status":200,"ms":32}
[order] {"ts":"2026-10-08T14:16:42.315Z","service":"order","requestId":"callgraph-bff-L-1791469000919","method":"GET","path":"/orders?userId=1","status":200,"ms":35}
[product] {"ts":"2026-10-08T14:16:42.355Z","service":"product","requestId":"callgraph-bff-L-1791469000919","method":"GET","path":"/products?ids=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21...
```
