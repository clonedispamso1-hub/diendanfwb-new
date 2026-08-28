# Di chuyển dữ liệu nặng sang Supabase 3

Supabase 3: `https://uaqsetfdciyzxpuhulux.supabase.co`

## Bảng đã chuyển (19)

`messages`, `message_reactions`, `message_gifts`, `chat_partners`, `conversation_clears`,
`group_messages`, `chat_group_messages`, `virtual_chat_messages`, `notifications`,
`post_views`, `activity_logs`, `engagement_points_log`, `engagement_events`,
`rate_limit_hits`, `keyword_logs`, `member_activity_log`, `group_stats_log`,
`group_leave_log`, `spam_detection_logs`.

Auth (`auth.users`), `profiles`, `posts`, `groups`, ví/quà/VIP… **giữ nguyên trên Supabase 1**.

## Kiến trúc

- **Supabase 3** giữ dữ liệu thật + index + RLS + trigger y hệt bản gốc.
  Các bảng lõi còn ở Supabase 1 (`profiles`, `posts`, `groups`, `group_members`,
  `bangchu`, `bot_roles`, `user_roles`, `user_restrictions`, `seed_accounts`,
  `chat_groups`, `engagement_campaigns`) được ánh xạ đọc/ghi qua `postgres_fdw`
  vào schema `s1`, nên các trigger như `notify_on_message`,
  `handle_interaction_points`, `_bump_post_views_count` vẫn chạy đúng.
- **Supabase 1** sau bước 2 chỉ còn *bảng ngoại* trỏ ngược sang Supabase 3, nên
  toàn bộ 122 hàm RPC / trigger / policy cũ vẫn hoạt động mà không phải sửa code.

## Thứ tự chạy

| File | Chạy trên | Trạng thái |
| --- | --- | --- |
| `001_schema.sql` | Supabase 3 | ✅ đã chạy |
| (copy dữ liệu + đối chiếu 1:1) | — | ✅ đã xong, 19/19 bảng khớp |
| `002_s1_cutover.sql` | Supabase 1 | ⏸ chờ duyệt |
| Bỏ comment phần `DROP TABLE ..._old_backup` trong `002` | Supabase 1 | ⏸ chờ duyệt (sau vài ngày chạy ổn định) |

Các chuỗi `__S1_*__` / `__S3_*__` trong file là chỗ điền thông tin kết nối; giá trị
thật lấy từ secret `SUPABASE1_DB_URL` / `SUPABASE3_DB_URL`, **không commit vào repo**.
