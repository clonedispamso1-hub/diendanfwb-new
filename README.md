# Chat Qr Beautifier

Hãy giúp tôi giải nén và import toàn bộ file ZIP này vào project để website chạy được. Đảm bảo cấu trúc các file components và cấu hình Supabase được giữ nguyên Hãy dùng lại DB cũ
Lovable, sửa lỗi hiển thị QR thanh toán trong chat Admin.

Hiện tại khi gửi QR/Bank cho user, phía user nhận được chuỗi raw:

[[qrpay:eyJ...]]

thay vì card QR.

Yêu cầu:

- Khi message chứa dữ liệu qrpay thì không hiển thị text raw.

- Parse dữ liệu qrpay và render thành một card thanh toán đẹp.

- Card gồm:

  + Tiêu đề QR do admin đặt (ví dụ: ADMIN HÀ NỘI)

  + Ảnh QR

  + Thông tin ngân hàng nếu có

  + Nội dung lưu ý nếu admin nhập

- Click vào ảnh QR thì mở popup zoom lớn để user dễ chụp màn hình.

- Giữ nguyên dữ liệu cũ, không đổi database.

- Tin nhắn thường vẫn hiển thị text bình thường.

- Không để lộ chuỗi qrpay ra giao diện người dùng.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://chat-qr-beautifier.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fc62df4c-f438-4a3b-bf90-01c235683c7e).

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
