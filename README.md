# Group Badge Enhancer

Hãy giúp tôi giải nén và import toàn bộ file ZIP này vào project để website chạy được. Đảm bảo cấu trúc các file components và cấu hình Supabase được giữ nguyên Hãy dùng lại DB cũ
## YÊU CẦU CHỈNH ICON NHÓM TRÊN TỪNG BÀI ĐĂNG

Hãy dựa chính xác vào 2 ảnh chụp màn hình tôi cung cấp để chỉnh sửa nút icon nhóm ở khu vực hành động bên dưới mỗi bài đăng.

### 1. Hiển thị số lượng nhóm

Hiện tại, mỗi bài đăng có nút icon nhóm nằm cạnh nút Like. Tôi muốn giữ nguyên nút này nhưng bổ sung số lượng nhóm mà chủ bài đăng đã tham gia.

* Nếu thành viên tham gia 5 nhóm, hiển thị số **5 màu đỏ** ngay trên nút icon nhóm.
* Nếu thành viên chưa tham gia nhóm nào, hiển thị số **0 màu đỏ**.
* Nếu tham gia 24 nhóm, hiển thị số **24 màu đỏ**.
* Số lượng phải được lấy từ dữ liệu nhóm thực tế của đúng thành viên sở hữu bài đăng, không tạo số giả hoặc dữ liệu mẫu.

### 2. Thiết kế giao diện

* Giữ nguyên icon nhóm hiện tại.
* Hiển thị con số màu đỏ nổi bật, dễ nhìn trên điện thoại.
* Có thể đặt số ở góc trên bên phải icon theo kiểu badge nhỏ, hoặc bố trí sát icon nếu phù hợp với cấu trúc giao diện hiện tại.
* Badge phải gọn gàng, không làm nút quá lớn, không che icon và không gây tràn ngang.
* Giữ nguyên màu sắc, kích thước và bố cục của các nút Like, Facebook và Nhắn tin.
* Áp dụng thống nhất cho tất cả bài đăng trong bảng tin.

### 3. Khi người dùng nhấn vào icon nhóm

Giữ nguyên chức năng mở danh sách nhóm hiện có.

* Nếu thành viên có nhóm, hiển thị đúng danh sách các nhóm họ đã tham gia, theo dữ liệu thực tế.
* Nếu thành viên chưa tham gia nhóm nào, hiển thị thông báo hiện có hoặc nội dung tương đương: “Thành viên này chưa tham gia nhóm nào.”
* Số lượng trên badge phải khớp với danh sách nhóm được hiển thị.
* Không thay đổi quyền riêng tư hoặc để lộ thông tin nhóm mà người xem không được phép truy cập.

### 4. Yêu cầu kỹ thuật

* Kiểm tra component đang render nút icon nhóm và popup “Các nhóm của …”.
* Tận dụng dữ liệu nhóm hiện có, tránh tạo truy vấn Supabase/API lặp lại cho từng bài đăng nếu có thể tái sử dụng dữ liệu đã tải.
* Xác định chính xác cách đếm nhóm để tránh đếm trùng cùng một nhóm.
* Có trạng thái xử lý phù hợp khi dữ liệu đang tải hoặc xảy ra lỗi; không hiển thị số giả.
* Không tự ý thay đổi schema, RLS, RPC, dữ liệu hoặc cấu hình Supabase.
* Không sửa các chức năng không liên quan.

### 5. Kiểm tra sau khi hoàn thành

* Kiểm tra thành viên tham gia 0, 1 và nhiều nhóm.
* Xác nhận số trên badge khớp với danh sách nhóm trong popup.
* Kiểm tra nhiều bài đăng của các thành viên khác nhau.
* Chạy test liên quan, kiểm tra TypeScript và build.
* Báo cáo các file đã sửa, kết quả kiểm tra và những gì chưa xác minh.

**Tiêu chí nghiệm thu:** Mỗi bài đăng hiển thị số nhóm thực tế của chủ bài viết bằng badge màu đỏ trên icon nhóm. Người dùng vẫn bấm vào icon để xem danh sách nhóm như hiện tại. Chỉ sửa đúng phần này, không redesign bảng tin.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/95632cb2-2284-4b87-bc6d-6193af022603).

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
