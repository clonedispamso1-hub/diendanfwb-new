# BÁO CÁO RÀ SOÁT & PHÂN LUỒNG ADMIN PANEL (2026-08-22)

## 0. Kiến trúc phân luồng hiện tại

- `src/lib/supabase.ts` xuất `supabase` là **proxy định tuyến theo TÊN BẢNG**:
  `.from(table)` / `.channel()` tự chọn DB1 (core) hay DB3 (social) theo
  `src/services/database/config.ts` (`TABLE_ROUTES`). `auth`, `storage`, `rpc`
  luôn chạy ở **DB1**.
- `src/lib/db/router.ts` xuất client thô: `supabase` (DB1), `db2()` (DB2 media/VIP),
  `db3()` (DB3 logs/social), `supabaseAdminSession` (phiên Bang Chủ, storageKey riêng).
- Vì vậy “gọi `db1()`/`db3()`” trong Admin Panel = **import `supabase` từ
  `@/lib/supabase`** (đúng bảng → đúng DB), hoặc gọi `db3()` trực tiếp cho bảng log.

## 1. Kết quả kiểm tra phân luồng DB

### Đúng luồng (không cần sửa)
- **DB1 (core)**: `profiles`, `user_roles`, `bangchu`, `admin_permissions`,
  `admin_role_assignments`, `wallets`, `transactions`, `withdrawals`,
  `transfer_transactions`, `crm_customers`, `crm_expenses`, `post_gifts`,
  `admin_gift_batch_log`, `phone_verifications`, `profile_verifications`,
  `device_*`, `blocked_*`, `guides`, `banned_keywords`, `feedback_posts`,
  `fake_profiles`, `seed_accounts`, `reports`.
  Cấu hình web (`admin_site_settings`) ghi/đọc qua RPC `save_admin_site_settings` /
  `get_site_setting` trong `src/lib/admin-db.ts` → **DB1** ✅
- **DB3 (social/logs)**: `posts`, `comments`, `likes`, `comment_likes`, `follows`,
  `messages`, `message_reactions`, `group_messages`, `chat_partners`,
  `notifications`, `admin_logs`, `activity_logs`, `agent_activity_logs`,
  `keyword_logs`, `security_events`, `risk_scores`, `moderation_queue`,
  `system_health_logs`, `candy_logs`, `post_views`, `engagement_*` ✅
- **DB2 (media/VIP)**: `live_moc_rooms`, `live_moc_settings` (LiveMocManager dùng
  `storageDb`), upload media/Cloudinary ✅
- Toàn bộ 48 component trong `src/pages/admin`, `src/components/admin-v1/v2/v3`,
  `src/components/candy/admin-modules` đều import client định tuyến
  (`@/lib/supabase`) — **không còn file nào tự `createClient()`** ✅

### Đã phát hiện SAI và ĐÃ SỬA
| File | Lỗi | Đã sửa |
|---|---|---|
| `src/lib/admin-bulk.ts` | “Xoá toàn bộ bài viết” / “Wipe nội dung 1 user” xoá `posts`, `likes`, `comments` bằng client **DB1 thô** → xoá vào DB rỗng, bài viết thật ở DB3 vẫn còn | Đổi sang client định tuyến `@/lib/supabase` (RPC/auth vẫn DB1) |
| `src/lib/follow-actions.ts` | Ghi/xoá `follows` vào **DB1** trong khi đọc bằng `read3()` (DB3) → theo dõi/bỏ theo dõi không khớp | Đổi sang client định tuyến |
| `src/lib/bot-system.ts` (`listRiskScores`) | Đọc `risk_scores` từ DB1 | Chuyển sang `db3()` |
| `src/lib/bot-assignments.ts` | Đọc `risk_scores` từ DB1 (kèm profiles) | `profiles`→DB1, `risk_scores`→`db3()` |

### Tích hợp ngoài
| Tính năng | Cơ chế |
|---|---|
| `/api/public/cloudinary-sign` | API route (server), xác thực Bearer token + kiểm `profiles.is_admin` ở DB1 |
| `/api/public/sync-content-to-s3` | API route, bảo vệ bằng `CRON_SECRET`, đồng bộ DB1→DB3 |
| `/api/public/purge-chat-cron`, `purge-logs-cron`, `auto-approve-cron` | API route + `CRON_SECRET` (timing-safe compare) |
| `/api/public/client-ip` | API route công khai, chỉ trả IP |
| Edge Functions (`bot-worker`, `cleanup-stories`, `group-cleanup-cron`) | Chạy nền, không phục vụ UI Admin |

## 2. Xác thực quyền Admin

- Nguồn duy nhất: `src/lib/admin-db.ts::isAdminNow()` → kiểm `bangchu.status='approved' AND is_active`
  **hoặc** cờ `profiles.is_admin = true` trên **DB1**; kèm `my_admin_permissions()` RPC
  (`src/lib/admin-permissions.ts`) cho phân quyền module.
- API route duy nhất cần quyền admin (`cloudinary-sign`) kiểm `profiles.is_admin` qua REST của DB1.
- **Không tồn tại bất kỳ kiểm tra email hardcode / localStorage flag nào** để cấp quyền admin
  (đã rà `@gmail`, `ADMIN_EMAIL`, `email ===`, `localStorage` → 0 kết quả liên quan tới quyền).
- RLS + RPC `SECURITY DEFINER` (`save_admin_site_settings`, `admin_*`) là lớp chặn ở server.

## 3. Bảng tổng hợp tính năng

| Tên tính năng | DB | Trạng thái routing | Ghi chú tối ưu / cache |
|---|---|---|---|
| Đăng nhập / duyệt Bang Chủ (`AdminLoginPage`, `AdminApprovalsPage`) | DB1 | ✅ | Session riêng `candy.admin.auth` |
| Phân quyền admin (`admin-permissions-manager`) | DB1 | ✅ | RPC `my_admin_permissions` |
| Quản lý thành viên (`MembersManager`, `DeviceDirectory`, `PendingApprovalsTab`) | DB1 | ✅ | `request-cache` 30s |
| Xác minh SĐT / hồ sơ (`phone-verifications`, `verification-center`) | DB1 | ✅ | — |
| Ví / Xu / Gem (`CoinTransfersManager`, `financial-panel`) | DB1 | ✅ | `candy_logs` đọc ở DB3 |
| Rút tiền / Nạp tiền (`WithdrawalRequestsManager`, `use-pending-withdrawals`) | DB1 | ✅ | RPC `admin_list_withdrawal_requests`; reload on-demand ≤1 lần/60s |
| Lịch sử giao dịch / tặng quà (`GiftHistoryManager`) | DB1 (+ notifications DB3) | ✅ | — |
| Cấu hình website (`admin_site_settings`, LogoManager, SiteLinksManager) | DB1 | ✅ | `rpc-cache` TTL 10 phút + invalidate sau khi lưu |
| Bài viết chờ duyệt / Home / FWB / Deleted posts | DB3 | ✅ | — |
| Xoá hàng loạt bài viết & wipe user (`admin-bulk`) | DB3 | ✅ **đã sửa** | Ưu tiên RPC, fallback xoá bảng |
| Bình luận (`CommentsManager`, `BulkCommentTab`) | DB3 | ✅ | — |
| Tin nhắn / reset hội thoại / clone chat | DB3 | ✅ | `chatDb()` |
| Thông báo hệ thống (`admin-broadcast`, notifications) | DB3 | ✅ | Retention cron |
| Báo cáo nội dung (Reports V2) | DB1 (`reports`) + log/notify DB3 | ⚠️ giữ nguyên | Bảng `reports` chỉ tồn tại ở DB1 (bàn thờ bảo mật, xem `services/database/config.ts`). Chuyển sang DB3 sẽ mất dữ liệu → **không đổi**, log & thông báo đã ở DB3 |
| Nhật ký admin (`security-center`, `audit-logs-viewer`) | DB3 | ✅ | — |
| Bot / Moderation queue / Risk scores | DB3 | ✅ **đã sửa** | `risk_scores` nay đọc DB3 |
| Từ khoá cấm & log (`keyword-manager`) | DB1 (`banned_keywords`) + DB3 (`keyword_logs`) | ✅ | — |
| Thống kê / Analytics / Dashboard | DB1 + DB3 | ✅ | Count `head:true`, cache ngắn |
| Live Móc 🦋 / Cộng đồng VIP | DB2 | ✅ | `storageDb` |
| Media library / GIF / upload | DB1 (`gif_library`) + DB2/Cloudinary | ✅ | Cloudinary signed qua API route |
| CRM / Guides / Scenario / Second accounts | DB1 (+ posts DB3) | ✅ | RPC `admin_scenario_*` |
| `src/services/admin.service.ts` | — | ⚠️ placeholder mock | Chưa nối DB; UI thật đang dùng `admin-bulk` / RPC. Nên xoá hoặc nối `admin_logs` (DB3) |

## 4. Kết luận

- 4 lỗi phân luồng thực tế đã được sửa (xoá bài viết, follow, 2 chỗ `risk_scores`).
- Không có lỗ hổng xác thực admin dạng email hardcode.
- `reports` cố ý giữ ở DB1 vì bảng không tồn tại trên DB3.
- Typecheck (`tsgo --noEmit`) và `bun run build`: **PASS**.
