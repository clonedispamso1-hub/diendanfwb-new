# Media Fixer Pro

Hãy giúp tôi giải nén và import toàn bộ file ZIP này vào project để website chạy được. Đảm bảo cấu trúc các file components và cấu hình Supabase được giữ nguyên Hãy dùng lại DB cũ
Sửa đúng lỗi hiển thị video trong bài viết:

Hiện tại ở Admin Panel > Tài khoản thứ hai, khi nhập URL video Catbox dạng:

https://files.catbox.moe/uyceje.mp4

URL đã hiển thị đúng trong form và bài viết đã được tạo, nhưng ngoài trang chủ card bài viết không hiển thị video, chỉ xuất hiện khoảng trống.

Yêu cầu:

- Kiểm tra toàn bộ logic frontend đang render media của Post/Card.

- Nếu URL là video trực tiếp, đặc biệt các URL có extension .mp4, thì phải render bằng thẻ <video>.

- Video cần có controls, playsInline, preload="metadata".

- Không autoplay.

- Giữ nguyên cách hiển thị ảnh hiện tại.

- Tự nhận diện media: ảnh thì render ảnh, video thì render video.

- Hỗ trợ tối thiểu .mp4; nếu hệ thống hiện tại đã hỗ trợ thêm .webm/.mov thì giữ nguyên.

- Phải hoạt động với URL Catbox trực tiếp như https://files.catbox.moe/uyceje.mp4.

- Không thay đổi database, Supabase, Auth, RLS, schema hoặc migration.

- Không thay đổi giao diện/card khác ngoài phần media cần sửa.

- Kiểm tra responsive mobile 375/390/430px và desktop.

Quan trọng: trước khi sửa hãy tìm chính xác component đang render media trong Post Card và sửa đúng chỗ, không tạo thêm hệ thống upload mới.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b1b60e56-5b79-44e1-b1a3-914811788e35).

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
