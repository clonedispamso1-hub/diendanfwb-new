# Báo cáo Bước 1 — Kiểm kê trước khi tách Supabase 3

Trạng thái: source đã import xong, website chạy bình thường trên **DB cũ (Supabase 1: zbuwddjcqdlyijcunwgd)**.
Chưa sửa bất kỳ dòng code truy vấn nào. Chưa chạy migration nào.

## 1. Kiến trúc hiện tại trong code

| Client | File | Dùng cho |
|---|---|---|
| Supabase 1 (chính) | `src/integrations/supabase/client.ts` | auth, profiles, posts, comments, likes, follows, messages, notifications... |
| Supabase 1 (phiên admin) | `src/integrations/supabase/admin-client.ts` | session riêng cho Bang Chủ (`storageKey: candy.admin.auth`) |
| Supabase 2 (media/nội dung phụ) | `src/integrations/supabase/secondary-client.ts` (`db2()`) | Live Móc, Cộng Đồng VIP, media — qua `VITE_MEDIA_SUPABASE_URL/ANON_KEY` |

Edge functions hiện có: `bot-worker`, `cleanup-stories`, `group-cleanup-cron`.
Migration SQL hiện có: 11 file trong `supabase/migrations`.

## 2. Bảng đang được code sử dụng (71 bảng, theo số lần gọi)

Nhóm CỐT LÕI — **giữ nguyên ở Supabase 1**:
`profiles(197)`, `posts(55)`, `messages(27)`, `follows(27)`, `comments(8)`, `likes(6)`, `comment_likes(3)`, `fwb_profiles`, `connection_requests`, `user_zalo`, `phone_verifications`, `profile_verifications`, và toàn bộ `auth.*`.

Nhóm ỨNG VIÊN chuyển sang **Supabase 3** (log / thống kê / hàng đợi):
`notifications(18)`, `activity_logs`, `admin_logs`, `agent_activity_logs`, `member_activity_log`, `candy_logs`, `keyword_logs`, `dice_logs`, `bot_actions_logs`, `bot_activity_queue`, `system_health_logs`, `security_events`, `risk_scores`, `engagement_events`, `engagement_campaigns`, `message_reactions`, `chat_partners`, `profile_views_today`, `connect_scan_usage`, `nearby_match_notifications`, `moderation_queue`.

Nhóm **KHÔNG NÊN chuyển** (dù trông giống log) — lý do:
- `gem_transactions`, `transfer_transactions`, `withdrawal_requests`, `post_coin_claims`, `red_packet_claims`, `pet_transactions`: nằm trong giao dịch tiền/gem, được ghi bên trong RPC `secure_transfer_gem`, `gift_gem_to_post_v3`, `claim_*`. Tách sang DB khác sẽ **mất tính atomic của transaction** → nguy cơ mất/nhân đôi số dư.
- `reports`, `user_restrictions`, `bangchu`, `admin_permissions`, `admin_role_assignments`: dùng trong RLS/`has_role` để quyết định quyền. Tách sang DB khác thì RLS ở Supabase 1 không đọc được → hỏng phân quyền.
- `fake_profiles`, `seed_accounts`, `bot_accounts`, `bot_assignments`: có FK trực tiếp tới `profiles`/`auth.users`.

## 3. Ràng buộc kỹ thuật bắt buộc phải xử lý trước khi chuyển

1. **Không có FK xuyên project.** Mọi bảng chuyển đi phải bỏ FK tới `profiles`/`auth.users`, giữ `user_id uuid` như khoá logic (không ràng buộc).
2. **RLS ở Supabase 3 không có `auth.uid()` của Supabase 1.** Người dùng đăng nhập ở Supabase 1, token đó **không hợp lệ** ở Supabase 3. Bắt buộc một trong hai:
   - (a) Supabase 3 dùng chung JWT secret / third-party auth trỏ về Supabase 1 (khuyến nghị), hoặc
   - (b) Mọi ghi/đọc nhạy cảm đi qua server function của website (service role của Supabase 3), client không gọi trực tiếp.
   Nếu bỏ qua điểm này, `notifications` sẽ đọc được của người khác → lỗ hổng bảo mật.
3. **~200 RPC `admin_*` / `claim_*` / `engagement_*`** đang chạy trong Supabase 1 và ghi thẳng vào các bảng log (ví dụ `log_admin_action`, `purge_old_logs`, `engagement_tick`, `record_profile_view`). Chuyển bảng đi = phải sửa cả function trong DB, không chỉ sửa code frontend.
4. **Realtime**: các channel `messages-live`, `admin_logs_rt`, `profiles-approvals`, ... phải được bật replication lại trên Supabase 3 cho các bảng đã chuyển.

→ Vì các điểm trên, việc chuyển sẽ làm theo **từng module một** (đề xuất thứ tự: `activity/admin logs` → `post_views/profile_views` → `notifications` → `message_reactions/chat_partners`), mỗi module: tạo schema → copy → đối chiếu số record/checksum → đổi code → test → mới sang module kế tiếp.

## 4. Đang chờ xác nhận từ bạn

Chưa thể sang Bước 2 vì **chưa có project Supabase 3**. Cần:
- Project URL của Supabase 3
- Publishable/anon key (dùng ở client)
- Service role key (lưu bằng Secret, không đặt trong code)
- Xác nhận cách xử lý auth cho Supabase 3 theo mục 3.2 (a) hay (b)

Chưa có file archive/drop nào được tạo. Không có bảng nào bị xoá, đổi tên hay sửa.

## 5. Kết quả migration nội dung (đã thực hiện)

- Schema `posts/comments/likes/follows/messages` đã tạo ở Supabase 3 (`supabase-sql/s3/010_content_schema.sql`).
- Đã copy & đối chiếu: posts 497/497, comments 1303/1303, likes 1444/1444, follows 1565/1565, messages 3490→3492.
- **ĐỌC** nội dung đã chuyển sang `db3()` qua `src/lib/content-db.ts` (`read3()`, `contentClient()`).
- **GHI** vẫn ở Supabase 1 (giữ RLS + trigger + ~200 RPC gem/quà/counters), kèm write-through
  sang #3 (`src/lib/content-sync.ts`) và cron bù `/api/public/sync-content-to-s3`
  (header `x-cron-secret`, nên chạy 1–2 phút/lần).
- Kiểm tra preview (đã đăng nhập): posts/comments/likes/follows = **0 request tới Supabase 1**, toàn bộ đi Supabase 3.
- Chưa chuyển: `messages` (chat) và các trang admin — chat cần bridge JWT (third-party auth) để RLS ở #3
  nhận token của #1; admin cần dữ liệu tức thời nên vẫn đọc #1.
