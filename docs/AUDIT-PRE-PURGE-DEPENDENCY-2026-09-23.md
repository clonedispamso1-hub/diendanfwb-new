# AUDIT CUỐI TRƯỚC EMERGENCY PURGE — CHỈ ĐỌC

Nguồn schema: OpenAPI thực tế của PostgREST (service_role) cho SB1–SB4 + Storage API + Auth Admin API.
Không có truy cập `psql` trực tiếp (PGHOST không được cấu hình), nên FK được lấy từ mô tả khoá ngoại
trong schema PostgREST — đây là FK thật do Postgres khai báo.
**Không DELETE / UPDATE / TRUNCATE / DROP / ALTER / migration. Không sửa `emergency-reset.ts`.**

Tổng quan: SB1 51 bảng/139 RPC · SB2 8 bảng/9 RPC · SB3 47 bảng/68 RPC · SB4 20 bảng/3 RPC.

## 1. FOREIGN KEY & THỨ TỰ XÓA

### SB1 (bảng cha duy nhất: `profiles`)
Con của `profiles.id`: `bot_assignments.account_id`, `device_accounts.user_id`,
`internal_account_credentials.profile_id`, `phone_verifications.user_id`,
`profile_verifications.user_id`, `red_packets.sender_id/receiver_id`,
`seed_accounts.profile_id`, `transfer_transactions.sender_id/receiver_id`,
`user_restrictions.user_id`, `withdrawal_requests.user_id`.

→ Xóa 11 bảng con trước, rồi `profiles`, cuối cùng `auth.users`.
Các bảng còn lại (gem_transactions, post_gifts, coin_transactions, forced_logouts, blocked_*,
banned_keywords, phone_blacklist, admin_*, bangchu, user_roles, vip_*, gif_library, nicktuongtac,
feedback_posts, crm_*, bot_*, fake_*, fwb_profiles, stories, videos_social, group_members,
popup_dismissals, withdrawal_audit_log) **không có FK cứng** → xóa theo thứ tự nào cũng được,
nhưng vẫn nên xóa trước `profiles` để tránh trigger phụ thuộc.

### SB2 — **không có FK nào**. 8 bảng độc lập, xóa tự do.

### SB3 — FK duy nhất: `engagement_events.campaign_id -> engagement_campaigns.id`.
posts/comments/likes/messages/follows **không có FK cứng** (liên kết bằng UUID logic tới SB1).
→ Xóa: log/quan hệ (post_views, likes, comment_likes, comments, follows, messages,
chat_partners, conversation_clears, notifications, member_activity_log, activity_logs,
weekly_scores, group_messages) → `posts` → `engagement_events` → `engagement_campaigns`.

### SB4 — FK: `bait_groups.folder_id -> bait_group_folders.id`;
`zalo_area_groups.item_id`, `zalo_user_areas.item_id`, `zalo_sub_items_l2.parent_item_id -> zalo_sub_items_l1.id`.
→ Xóa: `bait_groups` trước `bait_group_folders`; `zalo_area_groups`/`zalo_user_areas`/`zalo_sub_items_l2`
trước `zalo_sub_items_l1`.

> Vì chỉ dùng DELETE (không TRUNCATE), tôn trọng đúng thứ tự trên là đủ; không cần tắt FK.

## 2. NƠI CẤP QUYỀN ADMIN / BANG CHỦ (phải xóa hết)

| Vị trí | Hiện có | Ghi chú |
|---|---|---|
| `bangchu` (SB1) | **2** | BangChu_01 (agent, pending), BangChu_02 (admin_1, approved) |
| `profiles.is_admin = true` (SB1) | **2** | `0009990009`, `ZALO` — KHÁC 2 tài khoản bangchu |
| `user_roles` (SB1) | 0 | có schema, đang rỗng |
| `admin_role_assignments` (SB1) | 0 | |
| `admin_permissions` (SB1) | 0 | |
| `admin_config` (SB1) | 0 | |
| `bot_roles` / `bot_accounts` / `bot_assignments` (SB1) | 0 | quyền bot |
| `moderation_admins` (SB3) | 0 | admin kiểm duyệt |
| `auth.users` email `bangchu_0*@admin.candy.local` | 2 | phải xóa ở Auth |

Thứ tự Admin: `admin_permissions` → `admin_role_assignments` → `user_roles` → `admin_config`
→ `bot_assignments`/`bot_roles`/`bot_accounts` → `moderation_admins` (SB3) → `bangchu`
→ `profiles` (gồm 2 profile is_admin) → `auth.users`.
Sau chuỗi này **không còn bất kỳ nguồn quyền Admin nào**.

## 3. AUTH

- Chỉ SB1 có Auth: **256 user** (SB2/3/4 = 0).
- Cách an toàn: server-side service_role → `GET /auth/v1/admin/users?per_page=1000` (phân trang)
  rồi `DELETE /auth/v1/admin/users/{id}` cho từng id (có thể chạy batch ~20 song song).
- Không dùng SQL trực tiếp trên schema `auth`; không DROP schema auth; không đổi cấu hình Auth.
- Xóa `auth.users` **sau** khi xóa `profiles` và các bảng con để tránh lỗi FK tới `auth.users`.
- Bao gồm cả 2 tài khoản bangchu → sau purge không còn Admin đăng nhập được.

## 4. STORAGE (giữ bucket, xóa object)

| SB | Bucket | Object | Cần xóa object |
|---|---|---|---|
| SB1 | *(không có bucket)* | 0 | — |
| SB2 | media | **983** | ✔ |
| SB2 | feedback-media | 1 | ✔ |
| SB2 | live-thumbnails | 1 | ✔ |
| SB2 | call-media / meida | 0 | không cần |
| SB3 | feedback | 3 | ✔ |
| SB3 | payment-qr | 0 | không cần |
| SB4 | taixiu-assets | **20** | ✔ (asset game — cân nhắc giữ) |
| SB4 | report-proofs | 4 | ✔ |
| SB4 | album-covers | 4 | ✔ |
| SB4 | site-branding | 3 | ⚠ logo site — nên GIỮ |
| SB4 | zalo-media | 2 | ✔ |
| SB4 | zalo-float-icon | 2 | ⚠ icon giao diện — nên GIỮ |
| SB4 | bait-groups / live-media | 0 | không cần |

Cách purge: `POST /storage/v1/object/list/{bucket}` (đệ quy theo prefix, limit 1000) để thu path,
rồi `DELETE /storage/v1/object/{bucket}` với body `{"prefixes":[...]}` theo lô ≤ 1000.
**Không gọi `DELETE /storage/v1/bucket/{name}`** → bucket được giữ nguyên.

## 5. ĐỐI CHIẾU BẢNG THỰC TẾ vs AUDIT TRƯỚC

Bảng có trong schema nhưng thiếu trong audit trước — đã đếm bổ sung, **tất cả = 0**:
SB1 `group_members` 0, `popup_dismissals` 0, `v_seed_accounts` 0 (view), `internal_account_credentials` 0,
`coin_transactions` 0; SB3 `engagement_points_transfers` 0; SB4 `group_folders` 0.
SB4 `nearby_pool_public` = **68** nhưng là **view** của `nearby_pool` (68) → không xóa riêng.

→ Không còn bảng nào có dữ liệu nằm ngoài audit. Đã phủ hết Admin, log, financial, social, chat,
album, Zalo, nearby, Tài Xỉu (chỉ ở Storage `taixiu-assets`, không có bảng), seed/bot.

## 6. RPC / FUNCTION BỊ ẢNH HƯỞNG (không xóa function nào)

- SB1 có sẵn bộ purge: `purge_cascade`, `purge_user_targets`, `purge_owner_columns`,
  `purge_has_uuid_id`, `purge_is_admin`, `admin_purge_all_accounts`, `admin_purge_member_full`,
  `admin_purge_account_refs`, `admin_delete_user_data`, `reset_all_website_data`.
  SB2/SB3 cũng có `admin_purge_all_members`, `purge_cascade`, `purge_caller_allowed`;
  SB4 có `reset_all_website_data`. → **Có thể tái dùng thay vì viết DELETE tay.**
- Nhóm gọi sau purge sẽ trả rỗng (không lỗi): `leaderboard_*`, `my_cash_flow`,
  `admin_list_members`, `admin_list_internal_accounts`, `list_admin_users`, `notify_*`,
  `refresh_weekly_scores`.
- ⚠ RỦI RO THẬT: các hàm gác quyền `is_admin`, `is_current_admin`, `check_admin_status`,
  `is_super_admin`, `has_bangchu_role`, `admin_guard`, `super_guard`, `purge_caller_allowed`
  sẽ trả FALSE cho mọi người sau khi xóa Admin → **không ai gọi được RPC admin nữa**.
  ⇒ Purge phải chạy bằng service_role ở server-side, và Admin/Bang Chủ phải xóa **CUỐI CÙNG**.
- `nearby_occupy_coordinate` / `nearby_release_expired_coordinates` (SB4) phụ thuộc `nearby_pool`/`map_coordinates`.

## 7. THỨ TỰ PURGE ĐỀ XUẤT (giữ nguyên schema, chỉ xóa record)

1. **Storage**: xóa object trong SB2 media/feedback-media/live-thumbnails, SB3 feedback,
   SB4 report-proofs/album-covers/zalo-media/taixiu-assets (giữ site-branding, zalo-float-icon nếu muốn giữ giao diện).
2. **SB3** (log & social): post_views → member_activity_log → activity_logs → likes → comment_likes
   → comments → chat_partners → conversation_clears → messages → group_messages → notifications
   → follows → weekly_scores → leaderboard_refresh_state → posts → engagement_events
   → engagement_campaigns → các bảng log còn lại (đang 0).
3. **SB4**: seeding_follow_logs → reports → map_coordinates → nearby_pool → nearby_settings
   → albums → seed_account_groups → bait_groups → bait_group_folders → zalo_area_groups /
   zalo_user_areas / zalo_sub_items_l2 → zalo_sub_items_l1 → zalo_country_cards / zalo_media_library
   → (giữ site_branding, zalo_float_icon nếu giữ giao diện).
4. **SB2**: user_zalo → voice_library → live_moc_rooms → call_sessions2 → video_posts → community_page
   → (site_settings2 / live_moc_settings là CẤU HÌNH — nên giữ).
5. **SB1 – dữ liệu user**: post_gifts → gem_transactions → coin_transactions → transfer_transactions
   → red_packets → withdrawal_requests → withdrawal_audit_log → phone_verifications
   → profile_verifications → device_accounts → internal_account_credentials → seed_accounts
   → bot_assignments → user_restrictions → user_blocks → forced_logouts → stories → videos_social
   → feedback_posts → nicktuongtac → group_members → popup_dismissals → **profiles**.
6. **SB1 – Admin (CUỐI)**: admin_permissions → admin_role_assignments → user_roles → admin_config
   → bot_roles/bot_accounts → moderation_admins (SB3) → admin_popups → admin_gift_batch_log → **bangchu**.
7. **Auth (SAU CÙNG)**: xóa toàn bộ 256 `auth.users` qua Admin API.

### Nên GIỮ (cấu hình/giao diện, không phải dữ liệu user)
`admin_site_settings` (19), `device_approval_settings` (1), `site_settings2` (149),
`live_moc_settings` (1), `site_branding` (1), `zalo_float_icon` (1), `leaderboard_weights` (7),
`vip_icons`/`vip_icon_folders` (121/10), `gif_library` (21), `banned_keywords` (66) — tuỳ quyết định của bạn.

## 8. RỦI RO CẦN XỬ LÝ

1. **Mất toàn bộ quyền Admin ⇒ không thể quản trị lại** — cần tạo lại Bang Chủ sau purge; purge chỉ chạy được bằng service_role server-side.
2. **Hai cơ chế Admin song song** (`bangchu` và `profiles.is_admin`) — bỏ sót một trong hai là còn Admin.
3. **FK profiles** — xóa `profiles` trước 11 bảng con sẽ lỗi 23503.
4. **`auth.users` phải xóa sau `profiles`** (profiles.id trỏ tới auth.users).
5. **View** `v_seed_accounts` (SB1), `nearby_pool_public` (SB4) — không DELETE trên view.
6. **Storage cấu hình** — xóa site-branding/zalo-float-icon sẽ làm mất logo & icon site.
7. **Purge đa-DB không có transaction xuyên project** — cần idempotent + log từng bước để chạy lại được.

## TÌNH TRẠNG

**Chưa có dữ liệu nào bị xóa hoặc sửa.** Không đổi Auth/RLS/Storage/function.
`emergency-reset.ts` chưa bị chỉnh. Chưa có nút purge. Đây vẫn chỉ là AUDIT.
