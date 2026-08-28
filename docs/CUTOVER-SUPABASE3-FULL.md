# Cutover 100% phần nặng sang Supabase 3

## Kiến trúc sau cutover

| Supabase 1 (`zbuwddjcqdlyijcunwgd`) — bàn thờ hệ thống | Supabase 3 (`uaqsetfdciyzxpuhulux`) — phần nặng |
|---|---|
| Auth: đăng nhập/đăng ký/session/mật khẩu | Feed: `posts`, `comments`, `likes`, `comment_likes` |
| `profiles` cốt lõi (kể cả tài khoản phụ/bot) | Chat: `messages`, `message_reactions`, `message_gifts`, `chat_partners`, `conversation_clears`, `group_messages`, `chat_group_messages`, `virtual_chat_messages` |
| Chặn IP / thiết bị, security gate, device approval | Mạng xã hội: `follows`, `notifications`, `post_views`, `profile_views(_today)` |
| Ví/gem, phân quyền, reports, cấu hình website | Nhật ký & bot: `activity_logs`, `admin_logs`, `agent_activity_logs`, `member_activity_log`, `candy_logs`, `keyword_logs`, `dice_logs`, `bot_actions_logs`, `bot_activity_queue`, `system_health_logs`, `security_events`, `risk_scores`, `moderation_queue`, `engagement_*` |

## Thay đổi code (đã xong, 0 lỗi TypeScript)

1. `src/services/database/config.ts` — bảng định tuyến duy nhất: toàn bộ Feed / Chat /
   Follows / Logs chuyển sang `social` (Supabase 3). Đọc **và** ghi đều đi #3.
2. `src/lib/supabase.ts` — proxy giờ định tuyến cả `channel()`: mỗi listener
   `postgres_changes` tự chọn database theo tên bảng (một channel có thể nghe
   bảng ở #1 và #3 cùng lúc). Presence/broadcast vẫn ở #1.
3. `src/lib/realtime-registry.ts` — dùng proxy định tuyến, bỏ logic chọn client thủ công.
4. `src/lib/content-sync.ts` + `/api/public/sync-content-to-s3` — **tắt** write-through
   và cron đồng bộ #1 → #3 (nếu còn chạy sẽ làm sống lại bản ghi cũ/đã xoá).
   Bật lại tạm thời bằng env `CONTENT_SYNC_ENABLED=1`.

## Việc phải chạy trên Supabase 3 (SQL Editor)

`supabase-sql/s3/030_full_cutover.sql` — an toàn khi chạy lại:
- tạo các bảng còn thiếu (`candy_logs`, `system_health_logs`, `security_events`,
  `risk_scores`, `comment_likes`, `profile_views`, `profile_views_today`);
- GRANT + policy `*_anon_bridge` cho toàn bộ bảng đã chuyển (hiện `posts`,
  `comments`, `likes`, `follows`, `admin_logs` đang chặn INSERT bằng anon key);
- trigger đếm `likes_count` / `comments_count` ngay trên #3;
- bật Realtime cho các bảng đã chuyển.

## Điểm cần biết

- Các RPC ở #1 (`gift_gem_to_post_v3`, `admin_internal_create_post`, `claim_post_*`…)
  vẫn ghi vào bảng ở #1. Muốn chúng tiếp tục đúng sau cutover, chạy
  `supabase-sql/s3/002_s1_cutover.sql` trên Supabase 1 để các bảng nội dung ở #1
  trở thành *foreign table* trỏ sang #3 (postgres_fdw) — cần `SUPABASE1_DB_URL`.
- Bảo mật: policy `anon_bridge` mở vì #3 chưa xác thực được token của #1. Khi bật
  Third-Party Auth (JWKS của #1) trên #3, DROP các policy `*_anon_bridge` và
  chuyển sang RLS theo `auth.uid()`.
