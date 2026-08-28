# NETWORK REPORT V2 — 2026-08-23

Cách đo: mở `http://localhost:8080/` (Chromium headless 1280×1800), ghi mọi request tới
`*.supabase.co` và `/api/*` trong 6 giây đầu.

## 1. Tổng quan

**13 request** cho lần tải đầu (kể cả ảnh cover). Không có polling, không có vòng lặp request.

| Host | Đường dẫn | Số lần |
| --- | --- | --- |
| SB#1 (core, mới) | `/rest/v1/admin_site_settings` | 4 |
| SB#1 | `/rest/v1/rpc/get_site_setting` | 2 |
| SB#1 | `/rest/v1/rpc/security_gate` | 1 |
| SB#1 | `/rest/v1/rpc/device_is_blocked` | 1 |
| SB#1 | `/rest/v1/rpc/leaderboard_follow` | 1 |
| SB#1 | `/rest/v1/rpc/leaderboard_active_stars_week` | 1 |
| SB#2 (media) | `/rest/v1/site_settings2` | 1 |
| SB#2 | `/storage/.../covers/....jpg` | 1 |
| App | `/api/public/client-ip` | 1 |

## 2. Có request lặp không?

Không. 4 lượt đọc `admin_site_settings` là **4 key cấu hình khác nhau** (maintenance, liên kết,
popup, cấu hình VIP) — mỗi key đọc đúng 1 lần rồi vào cache TTL 10 phút, F5 sau đó lấy từ
localStorage (`reqcache:v1:*`). 2 lượt `get_site_setting` cũng là 2 key khác nhau.
Không có cặp (host, path, key) nào bị gọi 2 lần.

## 3. Route đúng instance?

Auth/guard/xếp hạng → SB#1 mới. Media/cover/VIP → SB#2. Feed/chat/notify chưa nạp ở trang
đăng nhập nên chưa xuất hiện (đúng như thiết kế lazy).

## 4. Lỗi quan sát được

6 request trả **404** — tất cả là RPC chưa tồn tại trên Supabase #1 mới (DB còn trống):
`security_gate`, `device_is_blocked`, `get_site_setting` (×2), `leaderboard_follow`,
`leaderboard_active_stars_week`.

Đây **không phải lỗi code**: app đã trỏ đúng project mới, chỉ thiếu schema.
Khắc phục: chạy `supabase/sql/INIT_CLEAN_SB1.sql` trong SQL Editor của project mới.

Console chỉ còn 1 cảnh báo vô hại: CSP `upgrade-insecure-requests` trong policy report-only.

## 5. Chốt

Mạng sạch: 13 request, 0 request lặp, 0 route nhầm. Sau khi nạp schema SB#1, các 404 trên
sẽ hết và có thể chạy test chức năng đầy đủ (đăng ký, đăng nhập, feed, chat, thông báo, quà,
chuyển Coin/gem, clone, bot).
