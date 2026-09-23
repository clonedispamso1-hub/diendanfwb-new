# AUDIT — Emergency Reset (17 nhóm) · READ-ONLY

> **Phạm vi:** chỉ đọc code + file SQL trong repo. KHÔNG chạy SQL, KHÔNG xoá/sửa dữ liệu, KHÔNG migration.
> Mọi tên bảng dưới đây được trace từ `.from(...)` / `.rpc(...)` trong `src/` và từ file SQL thật trong repo.
> Bảng nào không tìm thấy định nghĩa trong repo được ghi rõ là **CHƯA XÁC MINH** — không suy đoán.

## 0. Bối cảnh hạ tầng

| Instance | Project ref | Vai trò | Khai báo |
|---|---|---|---|
| SB1 `core/primary` | gxfxqbhxoghdhokwjpex | auth, profiles, ví/gem, admin, popup, feedback, CRM, VIP icons | `src/lib/db/config.ts:35-43` |
| SB2 `media` | pymwwuscoftmdcmmeckp | Live Móc, voice, feedback-media, site_settings2 | `src/lib/db/config.ts:46-53` |
| SB3 `logs/social` | uaqsetfdciyzxpuhulux | posts/comments/likes/messages/notifications/logs | `src/lib/db/config.ts:56-62` |
| SB4 (client riêng) | ybzdpxwbpbkeqkqwbscp | bait groups, Zalo mồi, albums, site_branding, reports SB4 | `src/lib/supabase-v4.ts:1-45` |

Định tuyến bảng: `src/services/database/config.ts` (`TABLE_ROUTES`), module: `src/lib/db/config.ts` (`MODULE_DB`). SB4 **không** đi qua router.

**Trạng thái hiện tại của UI Khẩn Cấp:** `src/components/admin-v3/emergency/EmergencyManager.tsx:1-9,80-90` — placeholder thuần, `doReset()` chỉ hiện toast, không gọi Supabase. Vì vậy mục "Data affected" dưới đây là **phạm vi dự kiến**, chưa phải hành vi đã cài.

---

## 1. Reset dữ liệu tặng quà

- **Tables:** `post_gifts` (SB1), `message_gifts` (SB3 — `TABLE_ROUTES` dòng 74), `admin_gift_batch_log` (SB1).
- **SQL/migration:** `supabase/sql/RUN_NOW_GIFT_FLOW_FINAL_SB1.sql:19-44` (post_gifts + RLS + RPC), `supabase/sql/2026-08-23_AUDIT_send_post_gift_v2_SB1.sql`, `..._FIX_send_post_gift_v2_ambiguous_SB1.sql`, `docs/sql/2026-07-12_gift_escrow_system.sql:15-19` (bản SB1 cũ của message_gifts), `supabase-sql/s3/001_schema.sql:369-382` (bản SB3 đang chạy), `supabase/sql/2026-08-12_admin_bulk_gift.sql:9`, `supabase-sql/SB1/RUN_NOW_2026-08-26/27_CLONE_GIFT_V3→V6`.
- **Cột chính / PK:** `post_gifts(id PK, post_id, from_user_id, receiver_id, amount, gift_key, claimed, claimed_at, created_at)`; `message_gifts(id PK, message_id, sender_id, receiver_id, amount, gift_emoji, status, expires_at)`.
- **FK/CASCADE:** bản SB1 cũ có FK `→ auth.users ON DELETE CASCADE`, `message_id → messages ON DELETE CASCADE`; bản SB3 **không có FK cross-project** (`supabase/sql/MIGRATE_CHAT_TO_SB3.sql:10-12`).
- **Storage:** không tìm thấy bucket riêng cho icon quà (dùng emoji/CSS). VIP icon/GIF là hệ khác (mục 9).
- **RLS:** `post_gifts_read_all` cho SELECT công khai; mọi INSERT/UPDATE/DELETE bị revoke — chỉ ghi qua RPC SECURITY DEFINER.
- **RPC/trigger:** `send_post_gift_v2`, `claim_post_gift_v2`.
- **Xoá gì:** lịch sử quà đã tặng, quà trong tin nhắn, log tặng hàng loạt.
- **KHÔNG xoá:** số dư gem/candy trên `profiles`, `gem_transactions`, bài viết, tin nhắn.
- **Ảnh hưởng feature khác:** chip "đã tặng" trên post, modal người tặng, lịch sử quà (`src/components/candy/gift/gift-senders-modal.tsx:53`, `GiftedChip.tsx`), thống kê quà admin. Nếu còn quà `claimed=false` mà xoá → **gem đã trừ của người gửi sẽ không ai nhận được** (mất cân đối ví).
- **Auth:** không ảnh hưởng. **Schema:** giữ nguyên.
- **Risk / Safety: NEEDS REVIEW** — vì escrow 2 pha; phải xử lý quà chưa claim trước khi xoá.

## 2. Reset dữ liệu tin nhắn

- **Tables (SB3):** `messages`, `conversations`, `message_reactions`, `message_gifts`, `chat_partners`, `conversation_clears`, `group_messages`, `chat_group_messages`, `virtual_chat_messages` (`src/services/database/config.ts:69-79`). Voice catalog `voice_library` ở **SB2**.
- **SQL/migration:** `supabase/sql/MIGRATE_CHAT_TO_SB3.sql:27-229` (schema + RLS + bridge), `docs/sql/RUN_NOW_2026-08-13_message_reset_72h.sql` = `supabase-sql/SB3/2026-08-23-message-reset-72h.sql`, `supabase-sql/SB3/2026-08-23-chat-delete-for-user.sql`, `supabase-sql/2026-08-23-chat-profiles-optimizations.sql`, `SB2_VOICE_LIBRARY_FINAL.sql`.
- **Cột chính/PK:** `messages(id PK, sender_id, receiver_id, conversation_id, content, image_url, reply_to, is_read, is_recalled, edited_at)`; `conversations` unique `(user_a,user_b)`; `message_reactions` unique `(message_id,user_id)`.
- **FK/CASCADE:** không có FK cross-project (SB3 ≠ SB1) → **xoá không tự cascade**, phải xoá theo đúng thứ tự con→cha.
- **Storage:** CÓ — voice ở bucket `voice-messages` trên SB2 (`src/lib/voice-chat.ts:15-19`), ảnh chat ở `media/chat` (`src/lib/media/providers/supabase-media.ts`). Xoá row **không** xoá file → rác storage.
- **RLS:** `*_anon_bridge` mở `FOR ALL USING(true)` (MIGRATE_CHAT_TO_SB3.sql:217-229) — không chặn xoá.
- **RPC/trigger:** `purge_expired_chat_data()`, `admin_reset_chat_data()` (đã có thật, dùng ở `src/components/admin-v3/messages/MessageResetManager.tsx:19-25`), trigger `remember_chat_partners()`.
- **Xoá gì:** tin nhắn, reaction, quà trong tin nhắn, (theo RPC hiện có: kèm `notifications`).
- **KHÔNG xoá:** `chat_partners` (chủ ý giữ danh sách người từng nhắn), profiles, ví.
- **Auth:** không. **Schema:** giữ nguyên.
- **Risk / Safety: SAFE** (đã có RPC admin chạy trong production) — nhưng lưu ý RPC hiện tại **xoá kèm notifications**, và file voice/ảnh không được dọn.

## 3. Reset dữ liệu tài khoản user

- **Tables:** `profiles` (SB1, PK `id uuid REFERENCES auth.users(id) ON DELETE CASCADE` — `supabase/sql/SB1_FINAL_SCHEMA_FIX.sql:66-110`) + hàng chục bảng con trỏ về `profiles(id)`/`auth.users(id)` ở cả SB1/SB3/SB4.
- **SQL/migration:** `supabase/sql/SB1_PURGE_MEMBER.sql` (`_purge_user_targets()`, `_purge_cascade`, `admin_purge_member_full`, alias `admin_delete_user_data`, `admin_purge_all_accounts('XOAHETDI', ...)`), `SB2_PURGE_MEMBER.sql`, `SB3_PURGE_MEMBER.sql`, `supabase-sql/SB1/2026-08-24_admin_list_members_real_users_only.sql`.
- **Phân biệt quan trọng (đúng yêu cầu của bạn):**
  - *Xoá dữ liệu ứng dụng/profile* — không có RPC nào hiện làm "chỉ xoá profile, giữ auth". **Chưa tồn tại.**
  - *Xoá Supabase Auth user* — `admin_purge_member_full` xoá `profiles` **rồi xoá `auth.identities`, `auth.sessions`, `auth.users`**. `ResetWebsiteButton.tsx` + `supabase-sql/SB1/RUN_NOW_2026-08-28_reset_all_website_data.sql:42-46` cũng `delete from auth.users`.
  - Vì bạn muốn **GIỮ hệ thống đăng nhập**, không được dùng lại `admin_purge_member_full` / `reset_all_website_data` cho card này.
- **Storage:** CÓ — avatar (`media/avatars`), ảnh bài viết, voice… không tự xoá.
- **RLS/trigger:** `profiles_block_privileged_columns` chặn sửa `candy/is_admin/is_vip/role` từ client (`supabase/sql/20260530_security_hardening_fixed.sql:106-139`).
- **Xoá gì (nếu làm đúng scope):** dữ liệu hồ sơ hiển thị (bio, avatar, tỉnh, đếm…) — cần định nghĩa lại rõ.
- **KHÔNG được xoá:** `auth.users`, `user_roles`, `bangchu`, ví/`gem_balance` nếu chưa có quyết định tài chính.
- **Risk / Safety: DO NOT DELETE (chưa duyệt thiết kế)** — cascade từ `profiles` sẽ kéo theo toàn bộ dữ liệu người dùng ở SB1; và vì `profiles.id` là FK tới `auth.users`, xoá profiles **không** xoá auth nhưng xoá auth **sẽ** xoá profiles. Cần chốt định nghĩa "profile-only wipe" trước khi viết bất kỳ SQL.

## 4. Reset dữ liệu tài khoản thứ hai

- **Cách biểu diễn:** không phải bảng identity riêng — là `profiles` có `account_source='internal'` (+ cờ `is_virtual`, `is_clone`, `is_seed_account`). Kèm 2 bảng phụ SB1: `fake_profiles` (`SB1_FINAL_SCHEMA_FIX.sql:1080-1088`), `seed_accounts` (`:1090-1109`, FK `profile_id → profiles(id) ON DELETE CASCADE`), hợp nhất qua view `v_seed_accounts` (`:1130+`). `seed_account_groups` ở SB4 (`supabase-sql/SB4/2026-09-17_seed_account_groups.sql`), `seeding_follow_logs` (`SB4/2026-09-18_seeding_follow_logs.sql`), `supabase-sql/SB3/2026-09-18_admin_seed_follow.sql`.
- **SQL/migration:** `supabase-sql/pending/2026-08-25_SB1_second_accounts_ACCOUNT.sql:385-437` (`admin_delete_internal_account`, `..._accounts`, `admin_delete_all_internal_accounts`), bản cũ trong `SB1_FINAL_SCHEMA_FIX.sql:1318,1331`, `docs/sql/2026-07-02_seed_accounts_db_only.sql`.
- **Lưu ý 2 DB:** comment `pending/...ACCOUNT.sql:392-394` nói rõ xoá tài khoản nội bộ = xoá `auth.users`+`profiles` ở SB1, **còn hoạt động (bài/comment/tin nhắn/thông báo) ở SB3 phải dọn bằng RPC riêng `admin_internal_purge_activity`** — RPC này **không tìm thấy trong repo** → CHƯA XÁC MINH.
- **Storage:** avatar clone ở `clone_media` (SB2, `RUN_NOW_2026-08-25_SB2_CLONE_MEDIA_STORAGE.sql`), voice clone.
- **Xoá gì:** tài khoản nội bộ/clone + nội dung do chúng tạo.
- **KHÔNG xoá:** thành viên thật (`account_source` ≠ internal), admin.
- **Auth:** CÓ — xoá `auth.users` của các nick nội bộ (không ảnh hưởng người thật).
- **Risk / Safety: NEEDS REVIEW** — file nằm trong `supabase-sql/pending/` nên chưa chắc đã apply; và phải chạy 2 phía SB1+SB3 cùng lúc, thiếu một phía sẽ để lại dữ liệu mồ côi.

## 5. Reset dữ liệu thông báo người dùng · 10. Reset dữ liệu thông báo

- **Tables:** chỉ có **một** bảng vật lý `notifications` (SB3, `TABLE_ROUTES:31`). "Thông báo hệ thống" thực chất là `posts` có `is_admin_post=true` + bảng đọc `admin_notice_reads` (SB3/SB1 theo posts).
- **SQL/migration:** `docs/sql/2026-07-05_follows_and_notifications_base.sql:40-60`, `2026-07-05_notifications_v4_rewrite.sql`, `supabase-sql/s3/001_schema.sql:634-655` (bản live: `dedup_key, actor_ids[], actors_count, link`), `supabase-sql/SB3/2026-08-23-notifications-actions.sql`, `2026-08-23_FIX_notifications_delete_rls_SB3.sql`, `docs/notifications-retention.sql`, `docs/sql/2026-07-16_admin_notice_system.sql:12-96` (`admin_notice_reads` PK `(user_id, post_id)`, FK CASCADE).
- **RLS:** `notifs_owner_all` theo `user_id = auth.uid()`.
- **RPC:** `unread_admin_notices_count`, `mark_admin_notices_read`; `purge_expired_chat_data`/`admin_reset_chat_data` cũng xoá notifications.
- **Không phân biệt được ở DB:** `notifications` **không có cột `is_system`/`scope`** → hai card 5 và 10 hiện trỏ về cùng một bảng. "batch notification" trong mô tả card không có bảng tương ứng → CHƯA XÁC MINH.
- **Xoá gì:** thông báo. **KHÔNG xoá:** bài viết admin (nếu chỉ xoá `notifications`), profiles.
- **Auth:** không. **Schema:** giữ nguyên.
- **Risk / Safety: SAFE** (dữ liệu phái sinh) — nhưng cần gộp/định nghĩa lại 2 card, và nếu xoá `posts` admin thì rơi sang mục 6.

## 6. Reset dữ liệu bài viết

- **Tables (SB3):** `posts`, `comments`, `likes`, `post_likes`, `comment_likes`, `post_views`, `post_reports`, `moderation_queue` (`src/services/database/config.ts:39,53-67`). `stories` **không có trong TABLE_ROUTES** → mặc định `core`/SB1 (`config.ts:107`); không tìm thấy `CREATE TABLE stories` trong repo → CHƯA XÁC MINH.
- **SQL/migration:** `supabase/sql/MIGRATE_POSTS_TO_SB3.sql`, `supabase/sql/20260603_post_edit_and_reports.sql:1-16` (post_reports FK CASCADE), `supabase/sql/RUN_NOW_post_cached_counters.sql:17-70` (counters + triggers), `docs/sql/2026-08-13_posts_soft_delete.sql:6-53` (soft delete + RPC `admin_soft_delete_post`/`admin_restore_post`), `supabase-sql/2026-08-25-admin_soft_delete_all_posts.sql`, `supabase-sql/SB3/2026-08-25-moderation-columns.sql`, `2026-08-25-pin-and-comment-lock.sql`, `supabase-sql/SB2/2026-09-12_video_posts.sql`.
- **FK/CASCADE:** `post_reports.post_id → posts ON DELETE CASCADE`; các bảng like/comment ở SB3 không có FK cross-project → xoá phải theo thứ tự.
- **Trigger:** `_bump_post_likes_count`, `_bump_post_comments_count`, `_bump_post_views_count` → xoá hàng loạt sẽ kích hoạt trigger, nên xoá bảng con trước rồi `posts`.
- **Storage:** CÓ — `media/posts`, `media/comments`, `media/stories`, video R2/Cloudinary.
- **Xoá gì:** bài, bình luận, like, view, report bài. **KHÔNG xoá:** profiles, ví, thông báo admin (`admin_notice_reads` sẽ mồ côi nếu xoá posts admin).
- **Ảnh hưởng:** feed, trang cá nhân, bảng xếp hạng (`leaderboard_daily`), engagement, quà theo post (`post_gifts.post_id` mồ côi).
- **Risk / Safety: NEEDS REVIEW** — vướng `post_gifts`, `admin_notice_reads`, leaderboard và file media.

## 7. Reset dữ liệu livestream

- **Tables (SB2):** `live_moc_rooms`, `live_moc_settings`, `community_page` (`supabase/sql/DB2_live_moc_community.sql:7-33`), cột thêm `live_user_id` (`supabase/sql/DB2_live_moc_live_user.sql:5-8`). Có thêm `supabase/sql/DB1_cleanup_live_moc_community.sql` (chưa đọc kỹ → CHƯA XÁC MINH phần SB1).
- **RLS:** mở hoàn toàn `for all using(true)` (`DB2_live_moc_community.sql:48-55`).
- **Storage:** thumbnail trên **Cloudflare R2** folder `live-thumbnails` (`src/lib/live-moc.ts:132-143`), không phải Supabase Storage.
- **Xoá gì:** danh sách phòng live. **KHÔNG nên xoá:** `live_moc_settings` (link liên hệ admin/VIP) và `community_page` (nội dung trang) — đó là **cấu hình**, xoá là mất link liên hệ toàn site.
- **Auth:** không. **Schema:** giữ nguyên.
- **Risk / Safety: NEEDS REVIEW** — phải tách rooms (dữ liệu) khỏi settings/community_page (cấu hình).

## 8. Reset dữ liệu quản lý album

- **Tables (SB4):** `albums` (`supabase-sql/SB4/2026-09-21_albums.sql:9-26`) — `id PK`, `owner_id` (soft ref sang profiles SB1, **không FK**), `title`, `cover_url`, `view_count`, `photo_count`, `video_count`, `enabled`, `sort_order`.
- **Không có bảng `album_photos`/`album_media`** trong repo → nội dung ảnh/video trong album hiện không có bảng riêng (chỉ cover + counters). CHƯA XÁC MINH nếu bạn kỳ vọng có.
- **RLS:** mở hoàn toàn cho `anon, authenticated` (`:32-48`).
- **Storage:** bucket public `album-covers` (`:51-70`) — xoá row không xoá file.
- **Code:** `src/lib/albums.ts:13-14,77-201`, `src/components/admin-v3/albums/AlbumsManager.tsx`, `src/components/candy/album-page.tsx`.
- **Auth:** không. **Schema:** giữ nguyên.
- **Risk / Safety: SAFE** — độc lập, không FK ra ngoài; chỉ cần dọn kèm bucket.

## 9. Reset dữ liệu quản lý cộng đồng VIP

- **Không có bảng "cộng đồng VIP" riêng.** Dữ liệu nằm ở:
  - `admin_site_settings` (SB1) key `crm_community_vip_sets`, `crm_community_vip_config` (`src/lib/crm-community-vip.ts:1-20`) — file nói rõ "KHÔNG tạo bảng/migration mới".
  - `community_page` (SB2) — nội dung trang (xem mục 7).
  - Danh sách nhóm VIP theo vùng sinh **client-side bằng `Math.random()`** (`src/lib/vip-communities.ts:20-55`) — không có DB.
  - Tài sản VIP: `vip_icons`, `gif_library` (SB1, `supabase-sql/SB1/RUN_NOW_2026-08-25_GIF_LIBRARY_VIP_ICONS.sql:62-189`), file trên **Cloudinary** folder `vip/icons/*`, `vip/gifs/*` (`src/lib/vip-assets.ts:1-9,100-118`). RPC `vip_icons_bump_use`.
- **Cảnh báo:** `admin_site_settings` là bảng key-value **dùng chung** cho popup, floating dock, sticker, maintenance mode, VIP link. Xoá cả bảng = **sập cấu hình toàn site**.
- **Risk / Safety: DO NOT DELETE (dạng xoá bảng)** — chỉ được xoá **đúng key** `crm_community_vip_*`. Xoá `vip_icons`/`gif_library` sẽ làm hỏng badge/sticker VIP đang dùng ở bài viết & chat.

## 10. (xem mục 5)

## 11. Reset dữ liệu quản lý nhóm mồi

- **Tables (SB4):** `bait_group_folders` (`supabase-sql/SB4/2026-08-27_bait_groups.sql:6-13`), `bait_groups` (`:15-25`, FK `folder_id → bait_group_folders(id) ON DELETE CASCADE`).
- **RLS:** chỉ SELECT cho `anon, authenticated` (`:38-44`).
- **Storage:** bucket public `bait-groups` (`:47-52`).
- **Code:** types/helper trong `src/lib/supabase-v4.ts:47-100`.
- **Xoá gì:** thư mục + nhóm mồi tab "Nhóm". **KHÔNG liên quan** hệ Zalo (mục 12) — `src/lib/zalo-bait-groups.ts:1-6` ghi rõ "KHÔNG đụng bảng `bait_groups`".
- **Risk / Safety: SAFE** — dữ liệu nội dung admin tự tạo, cascade nội bộ sẵn.

## 12. Reset dữ liệu nhóm Zalo mồi

- **Tables (SB4, tách hoàn toàn khỏi mục 11):** `zalo_bait_groups` (`supabase-sql/SB4/2026-09-14_zalo_bait_groups.sql:8-21`, có CHECK `men+women+admin = member_count`), `zalo_area_groups` (`SB4/2026-09-19d`), `zalo_sub_items_l1` + L2 (`2026-09-19`, `2026-09-19e/f`), `zalo_media_library` + bucket `zalo-media`, `zalo_user_areas` (`2026-09-19c`), `zalo_country_cards` (`2026-09-18b`), `zalo_float_icon` (`2026-09-18`, có bucket riêng).
- **RLS:** mở CRUD hoàn toàn cho `anon, authenticated` (`2026-09-14:34-49`).
- **Code:** `src/lib/zalo-bait-groups.ts:9-100`, `src/lib/zalo-area-groups.ts`, `src/lib/zalo-sub-items.ts`, `src/hooks/use-zalo-user-areas.ts`.
- **Phân biệt 11 vs 12:** cùng instance SB4 nhưng **không chung bảng nào**. 11 = `bait_group_folders`+`bait_groups`. 12 = họ `zalo_*`.
- **Cần tách trong nhóm 12:** `zalo_country_cards`, `zalo_sub_items_l1/l2`, `zalo_float_icon`, `zalo_media_library` là **cấu hình/thư viện**; `zalo_bait_groups`, `zalo_area_groups`, `zalo_user_areas` là dữ liệu nhóm/người dùng.
- **Risk / Safety: NEEDS REVIEW** — xoá cấu hình cấp trên (country cards / sub items) sẽ làm popup Zalo trống dù nhóm còn.

## 13. Reset dữ liệu cá

- **Tables (SB1/core):** `withdrawal_requests` (`supabase-sql/SB1/2026-08-23-withdrawal-and-cashflow-fix-FINAL.sql:14-17`: `id, code, user_id, amount, fee, net_amount, bank_*, status, admin_note, reviewed_by/at, processed_at`), `gem_transactions` (`:9-11`), `transfer_transactions` (`:12-13`), số dư trên `profiles.gem_balance`/`candy`/`candy_balance`. Router ghim `wallets, transactions, withdrawals` = `core` (`src/services/database/config.ts:79-84`).
- **UI:** `src/components/admin-v3/wallet/FishManager.tsx` chỉ là wrapper của `WithdrawalRequestsManager` (`realOnly`) → "Cá" = quản lý yêu cầu rút.
- **RPC:** `admin_list_withdrawal_requests`, `review_withdrawal_request` (hoàn gem khi reject, `:74-118`), `request_cancel_withdrawal` (+ bản V2 pending→refunded), guard `_is_current_admin()/_admin_guard()`. **`transfer_gem_secure` không tìm thấy trong repo** dù được tham chiếu trong `20260530_security_hardening_fixed.sql:115` → CHƯA XÁC MINH.
- **Mâu thuẫn schema cần làm rõ trước khi làm gì:** SQL ghi `sender_id/receiver_id` nhưng code chạy `from_id/to_id` (`src/pages/GemHistory.tsx:41,74-75`, `src/pages/Wallet.tsx:139,198-199`). `coin_transfers`, `gem_history` chỉ xuất hiện trong danh sách wipe của `ResetWebsiteButton.tsx:13`, **không có CREATE TABLE** trong repo → CHƯA XÁC MINH.
- **Xoá gì:** lịch sử rút, lịch sử gem, chuyển khoản nội bộ.
- **KHÔNG được xoá riêng lẻ:** số dư `profiles.gem_balance` vs sổ `gem_transactions` là cặp bất khả phân — xoá một bên là **mất đối soát tài chính**; còn yêu cầu rút `pending` bị xoá = **mất tiền của thành viên thật**.
- **Auth:** không. **Schema:** giữ nguyên.
- **Risk / Safety: DO NOT DELETE** — dữ liệu tài chính, cần nghiệp vụ tất toán trước, không phải reset.

## 14. Reset dữ liệu quản lý popup chung

- **Cấu hình:** `admin_popups` (SB1, `docs/sql/2026-07-29_popup_manager.sql:26-51`; nullable patch `supabase-sql/SB1/RUN_NOW_2026-08-27_ADMIN_POPUPS_OPTIONAL_NULLS.sql:15-24`; chu kỳ lặp nằm trong JSON `style.repeatMinutes` — `RUN_NOW_2026-08-27_POPUP_PER_EVENT_TIMER.sql:15-20`; RLS + `is_admin()` — `RUN_NOW_2026-08-27_POPUP_RLS_FIX.sql:15-62`).
- **Log/hiển thị:** `admin_popup_events` (`2026-07-29_popup_manager.sql:54-64`, FK `popup_id → admin_popups ON DELETE CASCADE`), RPC `log_popup_event`, `popup_stats`.
- **Popup dạng key JSON (KHÔNG phải bảng):** `admin_site_settings.feature_popups` (`src/lib/feature-popups.ts:1-13`), `site_settings2.required_popup` trên SB2 (`src/lib/site/db2-settings.ts:9-72`).
- **Khuyến nghị tách:** reset chỉ nên xoá `admin_popup_events` (log). Xoá `admin_popups` = mất toàn bộ popup đã dựng; xoá key trong `admin_site_settings`/`site_settings2` = mất cấu hình bắt buộc.
- **Risk / Safety: SAFE cho log · NEEDS REVIEW cho cấu hình.**

## 15. Reset dữ liệu quản lý feedback

- **Table:** `feedback_posts` (SB1, `supabase-sql/2026-08-14-feedback-module.sql:9-38`) — `id PK`, `title, author_name, area, excerpt, content, image_url, thumb_url, like_base/target/start/seconds, view_*, rating, is_hidden, published_at`. RLS: public read `is_hidden=false`, admin full (`:48-65`).
- **Storage:** bucket `feedback-media` trên **SB2** (`supabase-sql/2026-08-14-feedback-storage-db2.sql:7-27`, prefix `fb/`). Có thêm bucket `feedback` trên SB3 (`supabase/sql/SB3_create_buckets_payment-qr_feedback.sql`) — CHƯA XÁC MINH bucket nào đang dùng.
- **Lưu ý dùng chung:** bucket `feedback-media` cũng được Floating Dock & Profile Sticker dùng (`src/lib/feedback-media.ts`) → **không được xoá sạch bucket**.
- **KHÔNG xoá:** profiles, posts, messages, ví (file SQL ghi rõ `:4`).
- **Auth:** không. **Schema:** giữ nguyên.
- **Risk / Safety: SAFE** cho bảng; **NEEDS REVIEW** cho storage vì bucket chia sẻ.

## 16. Reset dữ liệu bảo đẹp trai

- **Không có bảng riêng.** Hub gồm Floating Dock · Theo Dõi · Sticker trang cá nhân (`src/components/candy/admin-modules/bao-dep-trai-hub.tsx:1-44`).
- Cấu hình lưu trong `admin_site_settings` key `floating_dock` (`floating-dock-manager.tsx:1-13`, `src/lib/floating-dock-config.ts`) và key `profile_stickers` (`profile-sticker-manager.tsx:1-4`, `src/lib/profile-stickers.ts`). Ảnh lên bucket `feedback-media` (SB2).
- Phần "Theo Dõi" đụng tới `follows` (SB3, `TABLE_ROUTES:70`) + `daily_follow_stats`, `seeding_follow_logs` (SB4).
- **Risk / Safety: NEEDS REVIEW** — "reset" ở đây = xoá key cấu hình, tức **đưa UI về rỗng**, không phải xoá dữ liệu người dùng; nếu gồm cả `follows` thì là xoá quan hệ theo dõi thật → phải tách card.

## 17. Reset dữ liệu cài đặt (CRM & form quản lý khách hàng)

- **Bản ghi khách hàng (dữ liệu thật):** `crm_customers` (SB1, `docs/sql/2026-07-29_crm_customers.sql:5-25`: `id PK`, `code UNIQUE` auto `KH000001` qua sequence `crm_customer_code_seq` + trigger `crm_customers_code_trg`/`crm_set_code()` `:27-43`, `name, phone, zalo_name, facebook_*, region, package_price, status(unpaid|paid), purchased_at, approved_by, note`), `crm_expenses` (`:46-54`). RLS admin-only (`:66-76`). Code: `src/components/admin-v3/crm/CrmManager.tsx:80-467` (có bulk delete `:115`), `src/components/candy/crm-admin-sheet.tsx:47,78`, endpoint `src/routes/api/public/crm-card-submit.ts`.
- **Cấu hình/cài đặt (KHÁC hoàn toàn):** `admin_site_settings` (SB1), `site_settings2` (SB2, `src/lib/site/db2-settings.ts`), `site_branding` (SB4, `supabase-sql/SB4/2026-09-21_site_branding.sql`, bucket `site-branding`), các module `src/lib/crm-fee-config.ts`, `crm-community-rules.ts`, `crm-guide-*.ts`, `crm-member-benefits.ts`.
- **Xoá gì (nếu chọn):** `crm_customers`, `crm_expenses` = xoá **hồ sơ khách hàng + sổ chi phí thật**.
- **KHÔNG được xoá:** `admin_site_settings`, `site_settings2`, `site_branding` — là cấu hình vận hành site.
- **Risk / Safety: DO NOT DELETE** (dữ liệu khách hàng/kế toán) — nếu vẫn muốn, phải export trước và tách rõ 2 nhóm bảng.

---

## TUYỆT ĐỐI KHÔNG ĐƯỢC ĐƯA VÀO RESET

| Nhóm | Bảng / đối tượng | Nguồn |
|---|---|---|
| Auth | `auth.users`, `auth.identities`, `auth.sessions` | `SB1_PURGE_MEMBER.sql`, `RUN_NOW_2026-08-28_reset_all_website_data.sql:42-46` |
| Quyền admin | `user_roles`, `bangchu`, `bot_roles` | `20260530_security_hardening_fixed.sql:35-50`, `20260613_bangchu_admin_system.sql:25-51`, `INIT_CLEAN_SB1.sql:302-308` |
| Bảo mật/chống clone | `blocked_ips`, `blocked_devices`, `device_signals`, `device_approvals`, `phone_verifications`, `profile_verifications`, `user_restrictions` | `INIT_CLEAN_SB1.sql:224-243`, `docs/sql/20260824090000_anti_clone_purge_and_gate.sql:27-46`, `docs/sql/2026-07-24_phone_verification.sql:8-22` · **`device_signals`/`device_approvals` không có CREATE TABLE trong repo → CHƯA XÁC MINH** |
| Kiểm duyệt | `banned_keywords` | `docs/sql/2026-06-14_reports_keyword_system.sql:64-79`, `supabase-sql/SB1/2026-08-25-content-moderation-gate.sql` |
| Tài chính | `wallets`, `transactions`, `withdrawals`, `withdrawal_requests`, `gem_transactions`, `transfer_transactions`, `subscriptions`, `referrals`, `inventory` | `src/services/database/config.ts:79-84` |
| Tố cáo | `reports` (SB1) và `reports` (SB4, `supabase-sql/SB4/2026-08-28_reports.sql`) — **2 nguồn khác nhau, không merge** | audit backup trước đó |
| Cấu hình site | `admin_site_settings`, `site_settings2`, `site_branding`, `live_moc_settings`, `community_page` | `2026-07-29_popup_manager.sql:67-72`, `SB4/2026-09-21_site_branding.sql`, `DB2_live_moc_community.sql:22-33` |
| Hàm bảo mật | `is_admin()`, `has_role()`, `has_bangchu_role()`, `_is_current_admin()`, `_admin_guard()`, trigger `profiles_block_privileged_columns` | nhiều file |

Ngoài ra: **không dùng lại** `reset_all_website_data()` (`supabase-sql/SB1/RUN_NOW_2026-08-28_reset_all_website_data.sql`) và `ResetWebsiteButton.tsx` cho các card này — cả hai xoá `profiles` + `auth.users` + gộp bảng của 3 DB.

---

## BẢNG TỔNG HỢP

| # | Category | Tables Found | SQL/Migrations | Storage | Auth | Dependencies | Risk | Can Reset? |
|---|---|---|---|---|---|---|---|---|
| 1 | Tặng quà | `post_gifts`(SB1), `message_gifts`(SB3), `admin_gift_batch_log`(SB1) | RUN_NOW_GIFT_FLOW_FINAL_SB1, 2026-07-12_gift_escrow, s3/001_schema, CLONE_GIFT_V3–V6 | Không | Không | ví/gem, posts, messages | Trung bình | ⚠️ Sau khi xử lý quà chưa claim |
| 2 | Tin nhắn | `messages, conversations, message_reactions, message_gifts, chat_partners, conversation_clears, group_messages, chat_group_messages, virtual_chat_messages` (SB3) | MIGRATE_CHAT_TO_SB3, message-reset-72h, chat-delete-for-user | CÓ (`voice-messages` SB2, `media/chat`) | Không | notifications, voice_library | Thấp | ✅ Đã có RPC `admin_reset_chat_data` |
| 3 | Tài khoản user | `profiles`(SB1) + toàn bộ bảng con | SB1/2/3_PURGE_MEMBER, SB1_FINAL_SCHEMA_FIX | CÓ (avatar) | **CÓ nếu dùng RPC hiện có** | cascade toàn hệ | **Rất cao** | ❌ Chưa có "profile-only wipe" |
| 4 | Tài khoản thứ hai | `profiles(account_source='internal')`, `fake_profiles`, `seed_accounts`, view `v_seed_accounts`, `seed_account_groups`(SB4) | pending/2026-08-25_SB1_second_accounts_ACCOUNT, SB1_FINAL_SCHEMA_FIX:1318 | CÓ (`clone_media` SB2) | CÓ (chỉ nick nội bộ) | cần RPC SB3 `admin_internal_purge_activity` (chưa thấy) | Cao | ⚠️ Cần xác minh SQL đã apply |
| 5 | Thông báo người dùng | `notifications`(SB3) | follows_and_notifications_base, notifications_v4_rewrite, s3/001_schema | Không | Không | chat reset cũng xoá | Thấp | ✅ |
| 6 | Bài viết | `posts, comments, likes, post_likes, comment_likes, post_views, post_reports, moderation_queue`(SB3); `stories`(?) | MIGRATE_POSTS_TO_SB3, post_cached_counters, posts_soft_delete, moderation-columns | CÓ (`media/posts`, R2/Cloudinary) | Không | post_gifts, admin_notice_reads, leaderboard | Trung bình-cao | ⚠️ |
| 7 | Livestream | `live_moc_rooms`(SB2) · cấu hình: `live_moc_settings`, `community_page` | DB2_live_moc_community, DB2_live_moc_live_user | CÓ (R2 `live-thumbnails`) | Không | link liên hệ admin/VIP | Trung bình | ⚠️ Chỉ rooms |
| 8 | Album | `albums`(SB4) | SB4/2026-09-21_albums | CÓ (`album-covers`) | Không | không FK | Thấp | ✅ |
| 9 | Cộng đồng VIP | key `crm_community_vip_*` trong `admin_site_settings`; `vip_icons`, `gif_library`(SB1); `community_page`(SB2) | RUN_NOW_2026-08-25_GIF_LIBRARY_VIP_ICONS, popup_manager | CÓ (Cloudinary `vip/*`) | Không | popup/dock/sticker chung bảng settings | Cao | ❌ Xoá bảng · ⚠️ Xoá đúng key |
| 10 | Thông báo (hệ thống) | `notifications`(SB3), `posts.is_admin_post`, `admin_notice_reads` | 2026-07-16_admin_notice_system | Không | Không | trùng mục 5 | Thấp | ✅ Cần định nghĩa lại |
| 11 | Nhóm mồi | `bait_group_folders`, `bait_groups`(SB4) | SB4/2026-08-27_bait_groups | CÓ (`bait-groups`) | Không | cascade nội bộ | Thấp | ✅ |
| 12 | Nhóm Zalo mồi | `zalo_bait_groups, zalo_area_groups, zalo_sub_items_l1/l2, zalo_user_areas, zalo_country_cards, zalo_float_icon, zalo_media_library`(SB4) | SB4/2026-09-14 → 2026-09-19f | CÓ (`zalo-media`, icon bucket) | Không | cấu hình cấp trên | Trung bình | ⚠️ Tách dữ liệu / cấu hình |
| 13 | Cá | `withdrawal_requests, gem_transactions, transfer_transactions`(SB1), `profiles.gem_balance` | 2026-08-23-withdrawal-and-cashflow-fix-FINAL, request_cancel_withdrawal V1/V2 | Không | Không | đối soát ví, RPC review | **Rất cao** | ❌ |
| 14 | Popup chung | cấu hình `admin_popups`; log `admin_popup_events`; key `feature_popups`/`required_popup` | 2026-07-29_popup_manager, POPUP_OPTIONAL_NULLS, POPUP_PER_EVENT_TIMER, POPUP_RLS_FIX | Không | Không | popup engine toàn site | Thấp (log) / Cao (config) | ✅ log · ❌ config |
| 15 | Feedback | `feedback_posts`(SB1) | 2026-08-14-feedback-module, -storage-db2 | CÓ (`feedback-media` SB2 — dùng chung) | Không | dock/sticker dùng chung bucket | Thấp | ✅ bảng · ⚠️ file |
| 16 | Bảo đẹp trai | không có bảng — key `floating_dock`, `profile_stickers`; liên quan `follows`(SB3) | — | CÓ (`feedback-media`) | Không | UI toàn site | Trung bình | ⚠️ Cần tách card |
| 17 | Cài đặt CRM | dữ liệu: `crm_customers`, `crm_expenses`(SB1) · cấu hình: `admin_site_settings`, `site_settings2`, `site_branding` | docs/sql/2026-07-29_crm_customers | CÓ (`site-branding` SB4) | Không | endpoint crm-card-submit | Cao | ❌ dữ liệu khách · ❌ config |

---

## Việc cần chốt trước khi viết bất kỳ logic reset

1. **Mục 3** — định nghĩa chính xác "xoá dữ liệu hồ sơ nhưng GIỮ đăng nhập" gồm những cột/bảng nào. Hiện chưa có SQL nào làm việc này.
2. **Mục 5 vs 10** — chỉ có một bảng `notifications`; cần gộp hoặc định nghĩa tiêu chí phân loại (hiện DB không có cột phân biệt).
3. **Mục 13** — làm rõ `gem_transactions` dùng `from_id/to_id` hay `sender_id/receiver_id`; `coin_transfers`, `gem_history`, `transfer_gem_secure` chưa xác minh tồn tại.
4. **Mục 4** — xác minh `supabase-sql/pending/...` đã apply chưa và RPC SB3 `admin_internal_purge_activity` có tồn tại không.
5. **Mọi mục có Storage** — quyết định có dọn file (SB2 buckets / R2 / Cloudinary) cùng lúc hay không; xoá row đơn thuần sẽ để lại rác.
6. **Mỗi lần reset phải tạo Pre-Change Snapshot** theo `docs/BACKUP-RECOVERY-DESIGN.md` trước khi chạy.
