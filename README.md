# Album Tab Upgrade

Hãy giúp tôi giải nén và import toàn bộ file ZIP này vào project để website chạy được. Đảm bảo cấu trúc các file components và cấu hình Supabase được giữ nguyên Hãy dùng lại DB cũ
Tiếp tục chỉnh riêng tab "Album".

Khi bấm vào tab "Album", hãy hiển thị một trang/nội dung có layout GIỐNG HỆT tab "Hướng dẫn" hiện tại:

- Giữ nguyên thanh tab phía trên:

  Hướng dẫn | Album | Bài Viết

- Khi đang ở Album, tab "Album" phải có trạng thái active/badge giống tab "Hướng dẫn" đang active.

- Phần nội dung Album nằm ngay bên dưới thanh tab.

- Giữ nguyên thanh điều hướng phía dưới màn hình như hiện tại.

- Album phải có đầy đủ cả thanh phía trên và thanh phía dưới giống một tab/page thực sự, không phải placeholder.

- Khi chuyển Hướng dẫn ↔ Album ↔ Bài Viết, chỉ thay đổi nội dung ở khu vực giữa; không làm mất hoặc thay đổi 2 thanh điều hướng.

- Giữ nguyên kích thước, khoảng cách, bo góc, animation và responsive mobile hiện tại.

- Không tạo ảnh.

- Không tạo asset mới.

- Không thay đổi database.

- Không thay đổi Hướng dẫn và Bài Viết ngoài việc cho phép chuyển tab.

- Chưa cần làm nội dung/card Album chi tiết ở bước này.

Mục tiêu: bấm "Album" sẽ mở đúng một tab riêng, có cùng khung/layout với "Hướng dẫn", có thanh tab phía trên và bottom navigation phía dưới.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6ae9e382-8dd7-4e2d-b640-6a5c0a730265).

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
