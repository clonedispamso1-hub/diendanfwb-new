# Cấu hình Cloudflare R2 sau khi import / remix project mới

Website upload ảnh public lên Cloudflare R2 (avatar, bài viết, gallery, banner, GIF...).
Kết nối R2 đọc **5 biến môi trường** lưu ở **Project Secrets của Lovable** —
secret **không** nằm trong source code / ZIP, nên mỗi project mới đều trống và cần nhập lại **một lần**.

## 5 biến cần thiết

| Biến | Giá trị lấy ở đâu trên Cloudflare |
|---|---|
| `R2_ENDPOINT` | R2 → Overview → **S3 API** của tài khoản, dạng `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BUCKET_NAME` | Tên bucket R2 đang dùng |
| `R2_PUBLIC_DOMAIN` | Domain công khai của bucket (R2 → bucket → Settings → Public Development URL hoặc domain riêng), ví dụ `https://pub-xxxxxxxx.r2.dev` |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens → tạo token quyền **Object Read & Write** cho bucket đó |
| `R2_SECRET_ACCESS_KEY` | Hiện **chỉ 1 lần** khi tạo token — lưu ngay vào password manager |

## Các bước khôi phục (khoảng 1 phút)

1. Lấy đủ 5 giá trị trên (giữ bản gốc trong password manager — nguồn chân lý duy nhất).
2. Trong Lovable, yêu cầu agent **"khôi phục R2"** rồi dán 5 giá trị vào ô nhập bảo mật
   (hoặc tự nhập tại **Project Settings → Secrets**).
3. Kiểm tra: mở trang Profile → Đổi Avatar → upload ảnh → ảnh phải lên được và trả về URL R2.

## Lưu ý an toàn

- **Tuyệt đối không** dán secret vào source code, file `.env` thật, hay chat dưới dạng văn bản thường.
- File `.env.example` trong project chỉ liệt kê **tên** biến, không chứa giá trị.
- Token R2 chỉ cần quyền **Object Read & Write** cho đúng bucket — không dùng token Admin toàn quyền.
- Nếu leak token: vào Cloudflare R2 → Manage API Tokens → **xóa token cũ, tạo token mới**, rồi cập nhật lại 2 biến key trong Secrets.
