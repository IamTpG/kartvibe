# Call graph nội bộ của BFF (dữ liệu S)

Một request `GET /bff/web/dashboard?userId=1` với `x-request-id: callgraph-bff-S-1791469050989`. Các dòng log cùng `requestId` ở từng service:

| Service | Số lời gọi |
|---|---:|
| user | 1 |
| order | 1 |
| product | 1 |

```
[bff] {"ts":"2026-10-08T14:17:32.127Z","service":"bff","requestId":"callgraph-bff-S-1791469050989","method":"GET","path":"/bff/web/dashboard","status":200,"ms":75}
[user] {"ts":"2026-10-08T14:17:32.086Z","service":"user","requestId":"callgraph-bff-S-1791469050989","method":"GET","path":"/users/1","status":200,"ms":33}
[order] {"ts":"2026-10-08T14:17:32.089Z","service":"order","requestId":"callgraph-bff-S-1791469050989","method":"GET","path":"/orders?userId=1","status":200,"ms":35}
[product] {"ts":"2026-10-08T14:17:32.125Z","service":"product","requestId":"callgraph-bff-S-1791469050989","method":"GET","path":"/products?ids=1,2,3,4,5,6,7,8,9,10","status":200,"ms":33}
```
