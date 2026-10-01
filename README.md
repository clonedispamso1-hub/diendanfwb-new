# Project Lovable Audit

Hãy giúp tôi giải nén và import toàn bộ file ZIP này vào project để website chạy được. Đảm bảo cấu trúc các file components và cấu hình Supabase được giữ nguyên Hãy dùng lại DB cũ
AUDIT ONLY – CHƯA ĐƯỢC SỬA.

Kiểm tra ZaLove để tìm nguyên nhân của 3 vấn đề sau:

1) Supabase logs có rất nhiều 403:

- /auth/v1/user

- /user

- message: "token has invalid claims: token is expired"

Kiểm tra toàn bộ getUser(), auth listener, token refresh, retry loop, setInterval/polling và việc tạo nhiều Supabase client/listener. Tìm nguyên nhân khiến token hết hạn nhưng app vẫn gọi lặp bằng token cũ.

2) Có request 404:

POST /rest/v1/rpc/vip_icons_for_users

Kiểm tra toàn bộ nơi gọi RPC này và xác định vì sao đang 404, function nào đang thiếu/sai tên/sai schema/cache.

3) User cũ bị lỗi SĐT:

- public.profiles đã mất nhưng auth.users vẫn còn

- đăng ký lại SĐT báo đã đăng ký

- đăng nhập báo sai mật khẩu

- phải xóa user trong Authentication thì SĐT mới đăng ký lại được

Kiểm tra flow delete/bulk delete user, auth.users, public.profiles, foreign key/cascade, trigger tạo profile khi signup và mọi code liên quan.

KHÔNG được:

- sửa code

- sửa database

- xóa user

- đổi Supabase project

- đổi UI/logic khác

Chỉ trả về:

- file + dòng liên quan

- nguyên nhân

- mức độ ảnh hưởng

- cách sửa tối thiểu đề xuất cho từng vấn đề.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6d0ac7e2-869c-400a-83db-9ff63f844749).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
