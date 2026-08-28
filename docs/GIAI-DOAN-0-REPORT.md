# GIAI ĐOẠN 0 — Import + Tối ưu Egress (không chuyển DB)

Ngày: 2026-08-22 · Không chuyển Database, không copy dữ liệu, không tạo bảng mới,
không sửa giao diện, không đổi logic.

## 1. Import
- Giải nén `lovable-foundation-main.zip` → import toàn bộ `src/`, `supabase/`, `supabase-sql/`,
  `public/`, `scripts/`, `docs/`, config. Giữ nguyên cấu trúc components.
- Database Router (`src/lib/db/config.ts`) giữ nguyên: **Supabase #1 (core)**, **#2 (media/VIP)**,
  **#3 (logs/stats)** — vẫn trỏ đúng DB cũ, `MODULE_DB` không đổi.
- Đã chạy thật: trang đăng nhập render đúng, không lỗi runtime, typecheck sạch.

## 2. Rà soát Admin Panel (kết quả quét)

| Module | SELECT * | limit(1000/2000/5000) | N+1 | Query dư/lặp | Cache |
|---|---|---|---|---|---|
| Dashboard (`dashboard-overview`, `AdminV3Shell`, `StatsDashboard`) | không | không | không | 3 count `reports` tách rời | count head:true (payload ~0) |
| Quản lý Clone / Second Accounts | không | `virtual-profiles` 2000 | vòng `for` theo user (bulk) | có | không |
| Auto Post / Comment / Follow / Inbox / Gift | không | không | vòng `for` khi bấm chạy lô | không | không |
| Hall Of Fame | không | `gem_transactions` 2000 (cần SUM) | không | không | không |
| Quản lý User (`MembersManager`) | không | không (RPC có `p_limit/p_offset`) | không | không | server-side paging ✅ |
| Quản lý Bài viết / Bình luận / Tin nhắn | không | không | không | không | batch loader ✅ |
| Quản lý Gift (`GiftHistoryManager`) | không | không | không | không | batch `.in()` ✅ |
| Quản lý VIP (`vip-assets`) | không | `vip_icons` 1000 (nhánh fallback) | vòng `for` update từng user | không | không |
| Media Library | không | `gif_library` 1000 ×2 | không | folders gọi lại nhiều lần | **đã thêm cache 60s** |
| Followers Sheet | không | follows 1000 ×3 | không | tải cả 2 tab dù chỉ xem 1 | **đã lazy load** |
| FWB Page | không | follows 1000 | không | không | không |
| CRM | không | 2000 ×2 | không | không | không |

Toàn hệ thống **không còn `select("*")`** trong Admin Panel.

## 3. Đã tối ưu trong Giai đoạn 0 (không đụng UI/logic)

1. `followers-sheet.tsx` — cắt cột `profiles` từ 13 → 6 cột (bỏ `badge_id, is_admin, role,
   is_virtual, is_seed_account, is_clone, province` không dùng khi render) ở **cả 2** truy vấn.
   → giảm ~55% payload danh sách người theo dõi.
2. `followers-sheet.tsx` — **lazy load tab "Đã yêu thích"**: chỉ query khi người dùng mở tab đó.
   → bỏ hẳn 2 truy vấn (`follows` + `profiles`) cho phần lớn lượt mở.
3. `fwb-page.tsx` — cắt cột `profiles` từ 12 → 6 cột.
4. `lib/admin/exclude-admins.ts` — thêm **in-flight dedupe** (N nơi gọi cùng lúc → 1 request),
   TTL 60s → **5 phút**, `limit` 5000 → 500 (số admin thực tế < 50).
5. `lib/media-library.ts` — `fetchMediaFolders()` dùng `cachedQuery` TTL 60s + dedupe,
   tự invalidate sau khi thêm media (`invalidateMediaFolders`).

## 4. Module còn tạo nhiều Egress nhất (sau Giai đoạn 0)

| Hạng | Module | % Egress ước tính | Nguyên nhân còn lại |
|---|---|---|---|
| 1 | **Feed** (posts + profiles + post stats) | ~32% | `post-stats-batch` kéo **hàng** like/comment thay vì COUNT |
| 2 | **Messenger** | ~26% | mở hội thoại chạm 6–7 bảng, còn `select("*")` ở `chat-cache.ts`/`chat-page.tsx` |
| 3 | **Clone / Bulk automation** | ~16% | vòng `for` từng user; `virtual-profiles` limit 2000 |
| 4 | **Dashboard + Quản lý User** | ~8% | chỉ count head — đã nhẹ |
| 5 | **Notifications / activity** | ~6% | list + realtime |
| 6 | Nearby / VIP / Live / Pet / CRM | ~9% | tần suất thấp; CRM 2000 dòng/lần mở |
| — | Followers/FWB/Media (đã tối ưu) | ~3% (từ ~5%) | — |

**Mức giảm ước tính của Giai đoạn 0: ~5–8% tổng Egress**, tập trung ở Followers Sheet,
FWB, Media Library và các query admin lặp. Còn lại ~92–95% — phần lớn nằm ở Feed + Messenger,
chỉ giảm mạnh được khi tách DB hoặc đổi like/comment sang COUNT (chạm logic → để Giai đoạn 1).

## 5. Đề xuất thứ tự chuyển sang Supabase #3

1. **Feed nội dung** (`posts`, `likes`, `comments`, `post_views`, `post_gifts`) — ~32%, đã có
   sẵn đường sync `api/public/sync-content-to-s3`.
2. **Messenger** (`messages`, `chat_partners`, `message_reactions`, `conversation_clears`) — ~26%,
   đã có bridge policy `s3/020_chat_anon_bridge.sql`.
3. **Social phụ** (`follows`, `notifications`, `activity_logs`) — ~11%, phụ thuộc chéo thấp.
4. **Log bot** (`bot_actions_logs`, `moderation_queue`, `bot_activity_queue`, `risk_scores`).

Giữ ở Supabase #1: auth, `profiles`, ví/gem, VIP, admin/phân quyền, `reports`
(ràng buộc `auth.users` + RLS/RPC tài chính).
