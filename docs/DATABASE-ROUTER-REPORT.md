# Báo cáo Database Router (cập nhật sau bước import lại source)

## 1. Trạng thái Database Router — ĐÃ HOÀN THÀNH ở lớp code

- File cấu hình DUY NHẤT: `src/services/database/config.ts` (`TABLE_ROUTES`).
  Đổi Supabase 3 → Supabase 4 chỉ cần sửa `src/services/database/social.ts`
  (hoặc `VITE_LOGS_SUPABASE_URL/ANON_KEY`) + `TABLE_ROUTES`.
- `@/lib/supabase` nay là **client có định tuyến**: `supabase.from(table)` tự chọn
  database theo `TABLE_ROUTES`; auth / storage / rpc / realtime vẫn đi core (Supabase 1)
  → hành vi runtime không đổi, UI và API public không đổi.
- 70 file component/page/hook/route đã được chuyển khỏi import trực tiếp
  (`@/integrations/supabase/client|logs-client|secondary-client`) sang
  `@/lib/supabase` và `@/services/database` (`socialDb`, `storageDb`).
- ESLint chặn tái phạm: `no-restricted-imports` cho `src/components`, `src/pages`,
  `src/hooks` (cấm `createClient`, cấm import 3 client thô).
- Ngoại lệ hợp lệ: `src/routes/api/public/*-cron.ts` (server route, chạy bằng
  service/cron secret) và `src/integrations/supabase/*` (hạ tầng).

## 2. Bản đồ Module → Database (hiện tại)

| Module | Database | Ghi chú |
|---|---|---|
| Auth, profiles, clone/bot accounts | Supabase 1 (core) | không chuyển |
| Wallet, Gem, Xu, Candy, VIP, Inventory, Dragon Ball, Pet, Payment, Withdrawal, Transaction | Supabase 1 | atomic trong RPC |
| Admin Panel, Roles, Permissions, Website Settings, Reports | Supabase 1 | RLS/`has_role` phụ thuộc |
| Posts, Comments, Replies, Likes, Follows | Supabase 3 khi ĐỌC (`content-db.read3`), GHI ở Supabase 1 + write-through | đã copy & đối chiếu đủ record |
| Notifications, Views (post/profile), Activity/Keyword/Bot logs, Moderation queue, Engagement | Supabase 3 | đang chạy |
| Messages, Message Reactions, Gifts, Chat partners | Supabase 1 | **chưa chuyển** |
| Feed, Search, Recommendation | đọc theo bảng nguồn ở trên | không có bảng riêng |
| Upload media (ảnh/voice/video), GIF | Supabase 2 + Cloudinary | qua `Database.upload` |

- RPC: mặc định chạy ở core (`Database.rpc(fn, args)`); `Database.rpc(fn, args, "social")`
  khi hàm nằm ở Supabase 3.
- Realtime: bảng thuộc `SOCIAL_TABLES` subscribe trên Supabase 3, còn lại trên Supabase 1.
- Edge Functions (`bot-worker`, `cleanup-stories`, `group-cleanup-cron`): Supabase 1.

## 3. Bảng bắt buộc ở Supabase 1 và lý do

1. `auth.users`, `profiles`, clone/bot accounts — nguồn `auth.uid()`, có FK; không có FK xuyên project.
2. Ví/gem/xu/candy/transaction/withdrawal/payment — ghi bên trong RPC atomic; tách sẽ mất tính nguyên tử → sai số dư.
3. `bangchu`, `user_roles`, `admin_permissions`, `reports`, `user_restrictions` — dùng trong RLS/`has_role`; tách thì Supabase 1 không đọc được → hỏng phân quyền.
4. Website settings, VIP/inventory/pet/dragon ball — có FK và trigger tới profiles/ví.

## 4. Việc còn lại (đang bị chặn, cần bạn cấp quyền)

Chuyển tiếp Messages / Message Reactions / Gifts sang Supabase 3 cần thao tác **trên
database**, không chỉ code:

1. Service role key của Supabase 3 (lưu bằng Secret) để tạo schema + copy dữ liệu và đối chiếu số record.
2. Quyết định cầu nối auth cho chat: bật Third-Party Auth ở Supabase 3 trỏ JWKS của Supabase 1
   (khuyến nghị) hoặc mọi ghi/đọc chat đi qua server function.
   Nếu không, RLS ở Supabase 3 không nhận token của Supabase 1 → chat sẽ 401 hoặc lộ dữ liệu.
3. Bật replication realtime cho các bảng chat trên Supabase 3.

Trước khi có 2 mục trên, mọi bảng chat vẫn giữ ở Supabase 1 để **không mất dữ liệu và không hỏng RLS**.
