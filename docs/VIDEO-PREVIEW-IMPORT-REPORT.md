# Import ZIP và preview video

## Import
- Đã import 1.405 file nguồn từ ZIP; không thiếu file nguồn khi đối chiếu.
- Loại trừ metadata `.lovable` của project cũ, Git, dependency/build output; giữ route tree tự sinh của project hiện tại.
- Giữ cấu trúc components, routes và app TanStack đã có trong ZIP.
- `src/integrations/supabase` (6 file), `src/lib/db` (4 file), `supabase` (132 file) và `supabase-sql` (114 file) byte-identical với ZIP. Không chạy SQL/migration/RPC hay sửa DB, RLS, dữ liệu, Cloudinary hoặc media storage.
- Trang `/` mở trang đăng nhập gốc; nhận diện website đọc được từ dịch vụ cũ. Chưa xác minh toàn bộ chức năng của các dịch vụ bên ngoài hay phiên đăng nhập người dùng.

## File preview thay đổi
- `src/components/candy/post-media.tsx`: thêm lớp preview trước lần phát đầu tiên cho single/carousel; nút gọi `.play()` trên chính video hiện có. Không đổi URL, preload, native controls, fullscreen, hook playback hay tỷ lệ.
- `src/components/candy/clone-video-highlights.tsx`: dùng lớp preview chung, giữ handler mở MediaLightbox.
- `src/components/candy/featured-moments.tsx`: dùng lớp preview chung, giữ handler mở ImageLightbox, hover và tracking có sẵn.
- `src/components/candy/video-preview-effect.tsx`: lớp trang trí chung mới.
- `src/styles/video-preview.css`: CSS chung mới; import tại `src/styles.css`.
- `src/components/ui/button.tsx`: variant preview và size không áp đặt chiều cao cho ô tin nổi bật.
- `src/components/candy/post-media.test.tsx`: bổ sung kiểm thử thao tác Play.
- `AGENTS.md`: ghi nhận nguyên tắc kiến trúc dùng chung lớp trang trí.

## Thiết kế và performance
- Các khu vực không dùng chung toàn bộ player; dùng chung **VideoPreviewEffect** và một stylesheet, không nhân đôi hiệu ứng.
- Nền charcoal hoàn toàn opaque; hai pseudo-elements, 12 radial-gradients tạo hạt nhỏ, mờ. Không hiển thị thumbnail/video bên dưới trước khi bấm.
- Một lớp thay đổi opacity chậm trong 28 giây; không canvas, timer JS, backdrop blur, thư viện animation mới, GIF/video nền hay asset phụ.
- Chỉ hai span trang trí mỗi preview, không tạo một DOM node cho từng hạt.
- Particle scale theo khung; nút Play scale theo container. Fullscreen giữ lớp cao hơn preview.
- `prefers-reduced-motion: reduce` tắt animation.
- Không thay đổi tải video thật; giữ nguyên video element, src và preload. Dependencies cài bổ sung là dependencies đã có trong ZIP, không thêm dependency cho hiệu ứng.
- Không thấy lỗi JavaScript hoặc tràn ngang trong kiểm tra cô lập; chưa đo performance trên thiết bị thật với feed đông video.

## Kiểm tra
- 22/22 tests qua ở ba file: post-media, profile-post-media-grid, app-routing.
- Build tự động sau import/chỉnh sửa: `build OK` trong log hệ thống. Không chạy build/typecheck thủ công; typecheck riêng chưa có kết quả độc lập.
- Playwright desktop 1280px và mobile 390px: nền tối/hạt/Play hiển thị, không tràn ngang; reduced motion có `animation-name: none`.
- Kiểm tra Play bằng video WebM nhẹ chỉ trong `/tmp`, qua network interception của test: video gốc trong component vẫn cùng URL; currentTime tiến lên, paused=false, readyState=4. Fullscreen bài viết và tin nổi bật mở/đóng được.
- URL video mẫu gốc trả HTTP 200, codec H.264/AAC, nhưng Chromium của môi trường kiểm tra báo không hỗ trợ video đó. Không sửa URL, codec hay file thật để che lỗi; phát media thật chưa được xác minh trong trình duyệt này.
- Kiểm tra hình ảnh/thao tác thực hiện bằng component thật mount cô lập, không phải một phiên người dùng đăng nhập trong DB cũ. Luồng đăng nhập → feed thật → phát video vẫn cần xác minh trong phiên người dùng; không ghi dữ liệu kiểm thử vào DB.