# BƯỚC 2.5 — AUDIT AUTH + STORAGE + ADMIN (service_role, READ-ONLY)

Công cụ: `src/routes/api/public/audit-readonly.ts` (GET, cần `?secret=CRON_SECRET`).
Chỉ thực hiện: COUNT bảng (GET + `Prefer: count=exact`), GET `auth/v1/admin/users`, LIST storage object.
KHÔNG INSERT / UPDATE / DELETE / TRUNCATE / DROP / ALTER / migration. Key chỉ đọc từ env, không log, không trả về client.

## === AUTH (Supabase 1) ===

- **Tổng `auth.users`: 256** (khớp đúng `profiles` = 256 → không có user rác/orphan).
- Đã confirm (email/phone): **256/256**.
- Chưa từng đăng nhập (`last_sign_in_at` null): **122** → active thực tế ≈ **134**.
- SB2 / SB3 / SB4: `auth.users` = **0** (không dùng Auth, chỉ là DB dữ liệu).

### Admin / Bang Chủ đang tồn tại

| Nguồn | Bản ghi |
|---|---|
| `bangchu` (SB1, 2 dòng) | `BangChu_01` — role `agent`, status **pending**, auth_user_id `d734bdb1…` · `BangChu_02` — role `admin_1`, status **approved**, auth_user_id `4aeedd8a…` |
| auth email tương ứng | `bangchu_01@admin.candy.local`, `bangchu_02@admin.candy.local` |
| `profiles.is_admin = true` (2 dòng) | `0009990009` (`cc9a50e5…`), `ZALO` (`ccf02421…`) |
| `user_roles` | **0 dòng** (không dùng) |
| `admin_role_assignments` | **0 dòng** |
| `admin_permissions` | **0 dòng** |

⚠️ Lưu ý đối chiếu: 2 tài khoản `bangchu` (auth id `d734bdb1…`, `4aeedd8a…`) **khác** 2 profile
`is_admin=true` (`cc9a50e5…`, `ccf02421…`) → tồn tại **2 cơ chế quyền song song**.
Emergency purge sau này phải xử lý cả hai, không chỉ bảng `bangchu`.

## === STORAGE (object thực tế, đếm đệ quy) ===

| Supabase | Bucket | Public | Số object | Mục đích |
|---|---|---|---|---|
| **SB1** | *(không có bucket nào)* | — | 0 | Storage SB1 rỗng hoàn toàn |
| **SB2** | media | ✔ | **983** | ảnh/video bài viết, avatar, media chính |
| SB2 | feedback-media | ✔ | 1 | ảnh kèm góp ý |
| SB2 | live-thumbnails | ✔ | 1 | thumbnail Live Móc |
| SB2 | call-media | ✔ | 0 | media cuộc gọi |
| SB2 | meida | ✔ | 0 | bucket sai chính tả, rỗng (rác) |
| **SB3** | feedback | ✔ | 3 | ảnh feedback/log |
| SB3 | payment-qr | ✖ | 0 | QR thanh toán |
| **SB4** | taixiu-assets | ✔ | **20** | asset game Tài Xỉu |
| SB4 | report-proofs | ✔ | 4 | ảnh bằng chứng tố cáo |
| SB4 | album-covers | ✔ | 4 | ảnh bìa album |
| SB4 | site-branding | ✔ | 3 | logo/branding |
| SB4 | zalo-media | ✔ | 2 | ảnh mục Zalo |
| SB4 | zalo-float-icon | ✔ | 2 | icon nổi Zalo |
| SB4 | bait-groups | ✔ | 0 | ảnh nhóm mồi |
| SB4 | live-media | ✔ | 0 | media live |

Tổng object toàn hệ thống: **1.023**. Không xoá bucket/object nào.

## === ADMIN DATA (SB1 — số thật bằng service_role) ===

| Table | Count | Loại |
|---|---|---|
| bangchu | **2** | ADMIN (danh tính quản trị) |
| admin_site_settings | 19 | CẤU HÌNH HỆ THỐNG |
| admin_popups | 6 | ADMIN (nội dung popup) |
| admin_gift_batch_log | **77** | LOG/AUDIT |
| device_approval_settings | 1 | CẤU HÌNH HỆ THỐNG |
| banned_keywords | 66 | CẤU HÌNH kiểm duyệt |
| phone_blacklist | 20 | CẤU HÌNH chặn |
| blocked_ips | 11 | CẤU HÌNH chặn |
| blocked_devices | 11 | CẤU HÌNH chặn |
| forced_logouts | 24 | ADMIN (cưỡng chế đăng xuất) |
| user_restrictions | 2 | ADMIN (hạn chế user) |
| withdrawal_audit_log | 22 | LOG/AUDIT tài chính |
| gem_transactions | 10 | FINANCIAL |
| post_gifts | 36 | FINANCIAL |
| red_packets | 2 | FINANCIAL |
| vip_icons / vip_icon_folders | 121 / 10 | CẤU HÌNH nội dung VIP |
| gif_library | 21 | CẤU HÌNH nội dung |
| nicktuongtac | 12 | ADMIN (nick tương tác) |
| feedback_posts | 5 | USER |
| admin_config, admin_permissions, admin_role_assignments | 0 | ADMIN (thật sự rỗng) |
| user_roles, internal_account_credentials, seed_accounts, fake_profiles, fake_follows, bot_* , crm_* , coin_transactions, transfer_transactions, withdrawal_requests, phone_verifications, profile_verifications, user_blocks, stories, videos_social | 0 | (thật sự rỗng — đã xác minh bằng service_role) |

SB3 (ADMIN/LOG): `activity_logs` 1040, `member_activity_log` 1219, `post_views` 7177 là 3 bảng log lớn nhất;
`admin_logs`, `audit_logs`, `security_events`, `moderation_queue`, `moderation_admins`, `admin_comment_jobs` = **0 thật**.
SB4 (ADMIN): `bait_groups` 16, `seed_account_groups` 10, `bait_group_folders` 2, `seeding_follow_logs` 14,
`nearby_pool` **68** (trước đây bị chặn quyền nên hiển thị 0).

## Khác biệt so với audit anon (Bước 2)

Các bảng trước đây báo 0 vì RLS, nay có dữ liệu thật:
`bangchu` 2, `admin_gift_batch_log` 77, `banned_keywords` 66, `forced_logouts` 24,
`withdrawal_audit_log` 22, `phone_blacklist` 20, `gem_transactions` 10, `admin_popups` 6,
`red_packets` 2, `user_restrictions` 2, `nearby_pool` (SB4) 68.

## === TÌNH TRẠNG ===

**Chưa có dữ liệu nào bị xóa hoặc sửa.**

- `src/routes/api/public/emergency-reset.ts`: KHÔNG chỉnh sửa.
- Nút purge: CHƯA triển khai.
- Admin: CHƯA xóa.
- Auth / RLS / Storage / key: KHÔNG thay đổi.
- Đây vẫn chỉ là AUDIT.
