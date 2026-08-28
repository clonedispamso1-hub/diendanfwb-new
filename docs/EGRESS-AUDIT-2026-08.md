# Egress / Payload Audit — 2026-08

Mục tiêu: **giảm payload** (GB egress), không phải giảm số lượng query.

## 1. `.limit(1000)` / `.limit(500)` / `.limit(300)` — có thật sự cần?

| Nơi | Trước | Sau | Lý do |
| --- | --- | --- | --- |
| `followers-sheet.tsx` (followers + following) | `limit(1000)` × 3 + `profiles.in(1000 ids)` | **phân trang 40/trang** (`.range`) | Nặng nhất: 1000 follow-rows + 1000 profile-rows mỗi lần mở sheet |
| `follow-management-modal.tsx` | `limit(1000)` | `range(0, 49)` | Modal chỉ hiển thị vài chục dòng |
| `fwb-page.tsx` | `limit(1000)` | `range(0, 99)` | Ghép đôi chỉ cần 100 |
| `chat-page.tsx` (danh sách hội thoại) | `limit(600)` kèm `content` | `limit(250)` | 600 tin có nội dung = payload lớn nhất của chat |
| `virtual-profiles.ts` (hộp thư nick ảo) | `limit(2000)` kèm `content` | `limit(600)` | Admin inbox |
| `post-detail-page.tsx` (bình luận) | `limit(500)` | `limit(120)` | Bài viết thực tế < 120 bình luận |
| `Wallet.tsx` × 2 | `limit(500)` | `limit(150)` | Lịch sử 1 tuần |
| `GemHistory.tsx` | `limit(300)` | `limit(100)` | Lịch sử 5 ngày |
| `vip-assets.ts` × 3 | `limit(1000)` | `limit(300)` | Thư viện icon VIP |
| `media-library.ts` × 3 | `limit(1000)` | `limit(200)` | Grid ảnh |
| `crm/CrmManager.tsx` × 2 | `limit(2000)` (cột rộng) | `limit(300)` | Bảng admin |
| `keyword-manager.tsx` | `limit(1000)` | `limit(300)` | |
| `LiveMocManager`, `account-approvals-tab`, `StatsDashboard`, `CoinTransfersManager`, `reports-v2.service` | `500` / `300` | `100` | Bảng admin phân trang bằng UI |

Còn giữ nguyên (có lý do):
- `exclude-admins.ts` `select("id").limit(500)` — chỉ 1 cột UUID, payload ~18 KB.
- `hall-of-fame.tsx` `select("amount").limit(2000)` — 1 cột số, cần để cộng tổng tháng.
- `virtual-profiles.ts` `limit(20000)` × 2 — chỉ 2 cột id, dùng để đếm. **Việc tối ưu tiếp theo nên là RPC `count group by`** (đây là khoản egress admin lớn nhất còn lại).

## 2. `select("*")`

**0 chỗ còn dùng `select("*")`** trong `src/` (đã kiểm tra toàn bộ). Mọi query đều liệt kê cột tường minh.

## 3. `.order(...).limit(...)` không phân trang

Đã chuyển sang `.range()` thật: `followers-sheet` (followers/following), `follow-management-modal`, `fwb-page`.
Các chỗ còn lại là bảng admin / lịch sử ngắn hạn đã được hạ trần xuống 100–300 dòng, phân trang ở phía UI.

## 4. `Promise.all` gọi trùng

Không tìm thấy trường hợp gọi trùng kiểu `getProfile()` × 3.
- `profile-cache.ts` đã có **inflight map** để dedupe profile theo `id + cột`, nên các lời gọi song song được gộp.
- `AdminV3Shell` dùng `Promise.all` với `{ count: "exact", head: true }` → payload ~0.
- `chat-page.tsx` gọi `Promise.all` trên 4 truy vấn khác nhau (không trùng) và fan-out theo `groupIds` với `limit(1)`.

## 5. `supabase.from(...)` chạy khi component đã unmount

18 `useEffect` không có cờ `cancelled/alive`. Không có chỗ nào **phát request mới** sau unmount (request đã bay trước đó, chỉ `setState` bị bỏ qua — React 19 im lặng, egress = 0). Danh sách để dọn dần:
`user-search`, `transfer-gem-modal`, `feed-page:619`, `dashboard-overview`, `admin-permissions-manager`, `chat-view-presence`, `report-modal`, `report-post-modal`, `report-button`, `profile-page:305/614`, `story-viewer:82/95`, `AdminV3Shell:477`, `reaction-viewer`, `DeviceDirectory`, `MembersManager`, `featured-moments`.
Các luồng nặng (`followers-sheet`, `chat-page`, `post-detail-page`, `Wallet`, `GemHistory`) **đã có** cờ hủy.

## Ước lượng tác động

Số query gần như không đổi (mục tiêu không phải giảm query). Payload trên các luồng nóng:
- mở danh sách theo dõi: ~1000+1000 rows → 40+40 rows (**≈ /20**)
- mở tab chat: 600 → 250 tin có nội dung (**≈ -58%**)
- chi tiết bài viết: 500 → 120 bình luận (**≈ -76%**)
- bảng admin (CRM/stats/ví): 2000/500/300 → 300/150/100 (**-70% đến -85%**)

Bước tiếp theo nếu cần xuống mốc ~600 MB: chuyển 2 truy vấn đếm `limit(20000)` trong `virtual-profiles.ts` sang RPC đếm phía DB, và phân trang thật cho `chat-page` (cursor theo `created_at`).
