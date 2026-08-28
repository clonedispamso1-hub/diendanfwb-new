# API_USAGE_REPORT_V2 — 2026-08-23

Phạm vi: toàn bộ `src/`. Mục tiêu: xác nhận **không còn API thừa, route nhầm, request lặp**.
Đây là báo cáo audit — **không sửa logic/UI trong bước này**.

## 1. Định tuyến database (route nhầm?)

| Kênh | Instance | Trạng thái |
| --- | --- | --- |
| auth, profiles, follows, ví/gem, admin, automation | Supabase #1 `gxfxqbhxoghdhokwjpex` (MỚI) | ✅ đúng |
| feed, comments, chat, notifications, activity, stats | Supabase #3 `uaqsetfdciyzxpuhulux` (logs) | ✅ đúng |
| media, VIP, Live Móc | Supabase #2 `pymwwuscoftmdcmmeckp` | ✅ đúng |

- Nguồn sự thật duy nhất: `src/lib/db/config.ts` (`MODULE_DB`) + `src/services/database/config.ts` (`TABLE_ROUTES`).
- Mọi client đều đi qua `src/lib/db/router.ts` (lazy singleton theo instance) → **không có `createClient()` rời rạc** trong component.
- Chỉ 8 file còn import trực tiếp `@/integrations/supabase/*`, tất cả đều là lớp hạ tầng hoặc phiên admin tách riêng, hợp lệ:
  `src/lib/supabase.ts`, `src/lib/admin-db.ts`, `src/services/engagement.service.ts`,
  `src/pages/AdminPage.tsx`, `src/pages/admin/AdminLoginPage.tsx`, `src/pages/admin/AdminApprovalsPage.tsx`,
  `src/routes/maintenance.tsx`, `src/components/candy/maintenance-gate.tsx`.

**Kết luận:** không phát hiện route nhầm instance.

## 2. Server routes (`src/routes/api/public/*`)

| Route | Mục đích | Ghi chú |
| --- | --- | --- |
| `client-ip.ts` | lấy IP cho device-guard | 1 request/lần mở app |
| `cloudinary-sign.ts` | ký upload media | chỉ gọi khi upload |
| `auto-approve-cron.ts` | duyệt tài khoản tự động | cron |
| `purge-chat-cron.ts` | dọn chat hết hạn | cron |
| `purge-logs-cron.ts` | dọn log | cron |
| `sync-content-to-s3.ts` | đồng bộ nội dung → S3 | cron `*/5` (vercel.json) |

Không có endpoint mồ côi, không có route trùng chức năng. Không tạo Edge Function mới.

## 3. RPC — API thừa?

Tổng ~90 RPC được gọi, mỗi RPC có ít nhất 1 nơi dùng thật (không có RPC gọi mà không dùng kết quả).
Các RPC gọi từ nhiều nơi đều **đi qua lớp cache**, không phải gọi lặp:

- `get_site_setting` (7 nơi) → gom trong `getSiteSetting()` của `src/lib/admin-db.ts` với cache TTL 10 phút + dedupe in-flight; `force=true` chỉ dùng trong Admin Panel sau khi lưu.
- `secure_transfer_gem` (4 nơi) → 4 màn hình chuyển Coin khác nhau, mỗi lần chạy đúng 1 lời gọi theo hành động người dùng.
- `leaderboard_*` → 1 lần/lần mở modal xếp hạng.

Lớp chống lặp: `src/lib/request-cache.ts` (dedupe + TTL + persist localStorage) và `profile-cache.ts` (inflight map theo `id + cột`).

## 4. Payload

Xem `docs/EGRESS-AUDIT-2026-08.md`: **0 chỗ dùng `select("*")`**, các luồng nóng đã phân trang `.range()`, trần `limit` đã hạ 70–85%.

## 5. Việc còn treo (KHÔNG phải lỗi code)

Supabase #1 mới còn **trống schema** → 6 RPC trả 404 khi mở trang chủ (xem `docs/NETWORK_REPORT_V2.md`).
Cần chạy `supabase/sql/INIT_CLEAN_SB1.sql` trong SQL Editor của project mới trước khi test end-to-end.

## Chốt

Không còn API thừa, không có route nhầm instance, không có request lặp cùng key.
**Dừng tối ưu tại đây** — bước tiếp theo là test chức năng, rồi export SQL để khóa database.
