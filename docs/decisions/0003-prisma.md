# 0003. Dùng Prisma làm ORM

- **Trạng thái:** chấp nhận
- **Nguồn:** Block 1

## Quyết định
Dùng Prisma 7 với driver adapter `@prisma/adapter-pg`. Client sinh vào `src/generated/prisma` (không commit, tạo bởi `prisma generate` ở `postinstall`). Prisma 7 chỉ đọc `DATABASE_URL` qua `prisma.config.ts`.

Prisma không mô tả được `CHECK` constraint, nên migration ban đầu được sinh bằng `prisma migrate diff` rồi thêm tay 4 `CHECK` constraint.

## Lý do
Tự sinh TypeScript types từ `schema.prisma`, có công cụ migration tích hợp, API trực quan giúp viết query nhanh. Phù hợp scope và thời gian của bài tập.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| `pg` trực tiếp | Kiểm soát SQL tốt nhất nhưng phải tự viết boilerplate (pool, parameterized query, map row → object). |
| Drizzle ORM | Type-safe và gần SQL hơn nhưng nhóm chưa có kinh nghiệm, tài liệu ít hơn. |

## Hệ quả
- Phải ghi nhớ rằng migration có phần viết tay (CHECK); tạo migration mới bằng Prisma có thể không giữ chúng.
- Không dùng Prisma `8.x` (còn RC tại thời điểm quyết định); `prisma` và `@prisma/client` phải cùng version.
