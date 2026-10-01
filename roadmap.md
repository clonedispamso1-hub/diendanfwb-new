# Roadmap

## Feed — Tố cáo bài viết (2026-09-30)
- [x] Đặt nút Tố cáo ngay sau Like, mở biểu mẫu hiện có với UID/tên/avatar tác giả, Post UID và loại Bài viết; gỡ mục báo cáo khỏi menu dấu ba chấm.
- [x] Kiểm thử nút, menu và dữ liệu gửi vào dịch vụ báo cáo hiện có; kiểm tra bố cục hàng nút ở 320/375/390/430px và desktop; typecheck/build đạt.
- [ ] Kiểm chứng gửi báo cáo thật với DB cũ: môi trường xem trước không có phiên đăng nhập DB cũ.

## Nhóm — đổi nhãn hai tab (2026-09-30)
- [x] Đổi nhãn hiển thị: "Thành Viên Vip" → "Nhóm Miễn Phí", tab "Feedback Zalo" → "Lì Xì" trong `src/components/candy/group-membership-tabs.tsx`.
- [x] Giữ nguyên chức năng tab, kiểu active/inactive, bố cục, routing, database, logic VIP/Lì Xì và dữ liệu trong từng tab; tên nội bộ ("vip"/"guide") không đổi.
- [x] Build đạt.


## Feed — bỏ thanh dính "Hướng dẫn - Bài Viết" (2026-09-30)
- [x] Gỡ `FeedHeader` khỏi view Feed chính trong `src/components/candy/feed-page.tsx`; bài viết hiển thị liên tục từ trên xuống, không còn thanh dính hay nhãn nổi khi cuộn.
- [x] Không để lại khoảng trống: khu đăng bài bắt đầu sát mép trên, card bài viết cuộn bình thường.
- [x] Giữ nguyên Bottom Navigation, Card bài viết, nút Thích/Tặng/Facebook/Nhắn tin, menu Social, dữ liệu Feed, nạp vô hạn và routing.
- [x] Trang "Vào Cộng Đồng" (view community) vẫn giữ thanh tab làm đường quay về; không thay database hoặc schema.
- [x] Build đạt; kiểm tra DOM ở 390px: không còn `.feed-header` trong view Feed, không có phần tử dính nào ở đầu màn hình.

## Feed — menu Social nhanh (2026-09-30)
- [x] 5 mục Facebook/Zalo/Telegram/Instagram/X luôn sáng và bấm được kể cả khi tác giả chưa lưu liên kết.
- [x] Mọi cú chạm mở popup VIP hiện có của website thay vì mở liên kết mạng xã hội trực tiếp.
- [x] Không đổi database, schema, routing hay các màn khác; build đạt và có kiểm thử tự động cho 5 mục.

## Profile Social popup + VIP gate (2026-09-29)
- [x] Đưa popup chỉnh Social ra `document.body`, phủ toàn màn hình và cao hơn mọi nội dung profile.
- [x] Đổi định dạng nhập: số Zalo, URL Facebook, username Telegram/Instagram/X; kiểm tra và chuẩn hóa trước khi lưu.
- [x] Giữ 5 nút Social luôn sáng; profile mình mở popup sửa, profile người khác luôn mở popup VIP.
- [x] Không đổi database hoặc migration; giữ migration pending hiện có cho Telegram/Instagram/X.
- [x] Build đạt và popup được kiểm tra ở 375px, 390px, 430px; kiểm thử lưu dữ liệu thật bị giới hạn vì môi trường không có phiên đăng nhập DB cũ.

## Profile người khác — nút Kết bạn Zalo (2026-09-29)
- [x] Import nguyên source ZIP, giữ cấu trúc components và cấu hình DB cũ; không chạy migration hoặc sửa Auth/RLS.
- [x] Xóa icon ổ khóa, dây xích và hạt; giữ nguyên hành động mở popup của nút Kết bạn Zalo.
- [x] Thêm glow vàng nhẹ với 3 nhịp mỗi 5 giây, tự cleanup theo vòng đời CSS khi rời profile và không xuất hiện ở profile chính mình.
- [x] Kiểm tra thực tế tại 375px, 390px và 430px; xác nhận nút vẫn hoạt động và không tràn giao diện.

## /connect — ba tiêu chí (2026-09-28)
- [x] Chỉ giữ khu vực, khoảng tuổi 18–30, và một lựa chọn FWB/ONS/Người Yêu trong Cài đặt; bỏ ba tiêu chí cũ khỏi màn tìm kiếm và Card Bí Ẩn.
- [x] Kiểm tra mở/chọn/lưu/mở lại/tìm kiếm trên mobile, chạy test và kiểm tra build.

## /connect — Mini-game đơn giản
- [x] Bỏ Setup, Cài đặt, Radar và màn hoàn tất cũ khỏi luồng /connect; giữ màn KẾT NỐI và Card Bí Ẩn.
- [x] KẾT NỐI chạy 15 giây, có tiến độ và chuyển thẳng tới Card Bí Ẩn; X trở về màn chính, ❤️ giữ luồng yêu cầu.
- [x] Kiểm tra đường dẫn tab KẾT NỐI, 3 bài test và kiểu dữ liệu.
- [ ] Kiểm tra trực tiếp màn sau đăng nhập trên mobile/desktop: cần phiên đăng nhập của DB cũ không có sẵn trong môi trường này.

## /connect — Set up tìm kiếm (phần 1)
- [x] Audit trang trống, app shell, header/dock, tỉnh trong hồ sơ và danh sách quận huyện có sẵn.
- [x] Dựng card chọn vị trí, mối quan hệ, khoảng tuổi, nhu cầu và nút QUÉT chỉ có phản hồi tạm thời.
- [x] Nâng cấp visual premium và kiểm tra test /connect, bản chạy, mobile/desktop, không cuộn ngang; giữ nguyên các module khác.
- [x] Compact riêng màn Setup mobile để toàn bộ nút QUÉT nằm trên Bottom Navigation ở 360×568–430×932, không cuộn và không đổi logic.

## /connect — Radar quét (phần 2)
- [x] Giữ tiêu chí đã chọn bằng state phía client và chạy mô phỏng 5 giây, không gọi API hoặc database.
- [x] Hiển thị radar, tiến trình tuần tự, đồng hồ đếm ngược và trạng thái hoàn tất.
- [x] Hiển thị lại tiêu chí cùng mức tương thích ngẫu nhiên 50–99% có animation.
- [x] Kiểm tra test tự động, bản chạy, mobile/desktop và không cuộn ngang.

## Reset /connect về trang trắng (2026-09-27)
- [x] Xoá toàn bộ UI + logic mini-game KẾT NỐI trong /connect (wheel, 5 bubble, nút −/↻/+, badge lượt, reward popup, animation, state/handler).
- [x] Xoá `src/styles/connect-page.css` và @import trong `src/styles.css`; `ConnectPage` giờ render null.
- [x] Cập nhật test `connect-intents.test.tsx` (trang trắng) và rule trong AGENTS.md; không dựng lại mini-game.
- [x] Typecheck, test, full build và kiểm tra preview /connect.

## ZIP import + Admin ⚡ Album ảnh form
- [x] Import source and configuration from ZIP without overwriting project identity or connecting a different database.
- [x] Redesign only the new ⚡ album form with title, UP, ten image slots, preview, cover, generated code, and cancel/create.
- [x] Verify imported site responds and builds; legacy album manager untouched. Authenticated creation requires existing SB1/SB4 server credentials and an Admin session, unavailable in this environment.

- [ ] Remove all Live Mốc UI, routes, admin entries, data access, realtime, polling, timers, listeners, and styles.
- [ ] Remove all Feedback UI, routes, admin entries, data access, badges, polling, timers, listeners, and styles.
- [ ] Preserve the five-item bottom navigation and the current 18/KẾT NỐI icon visuals.
- [ ] Preserve community_page, SB3 feedback bucket, feedback-media.ts, supabase-logs.ts, sb3-upload.ts, and unverified SB2 feedback-media.
- [ ] Remove Live Mốc and Feedback references from popup, audit, purge, and emergency-reset code without affecting unrelated cleanup.
- [ ] Add a manual SQL migration document for SB1/SB2 cleanup; do not execute database changes.
- [ ] Verify with tsgo, exhaustive source searches, diagnostics, and the live bottom navigation.
## Album ảnh số 18

- [x] Thiết kế lại hai nút thao tác và danh sách album ngang trên mobile.
- [x] Làm gallery ngang, xem ảnh toàn màn hình, zoom và vuốt chuyển ảnh.
- [x] Đảm bảo mỗi lần mở album chỉ tăng đúng một lượt xem.
- [x] Thay liên kết Zalo theo album bằng một liên kết dùng chung do Admin lưu.
- [x] Kiểm tra giao diện, luồng mở album và lỗi build.
- [x] Redesign riêng hai nút "Nhập Code" và "Nhóm Zalo Lấy Code": chỉ text, không icon, premium tối giản.
- [x] Chỉnh riêng UI user nút 18: card hiển thị số media thực tế, gallery một ảnh/video với nút chuyển, vuốt, đóng và zoom.

## KẾT NỐI (đã xoá 2026-09-27)

- [x] Toàn bộ mini-game KẾT NỐI đã bị xoá; /connect là trang trắng. Không khôi phục.

## /connect — Card Bí Ẩn

- [x] Giữ radar hiện tại; không khôi phục wheel, 5 bubble hoặc orbit.
- [x] Chạy thanh tương thích từ 1% đến mức ngẫu nhiên 50–99% trong 7–10 giây.
- [x] Hiện Card Bí Ẩn client-only với ảnh lớn bị che, tên Ẩn Danh, tuổi trong khoảng đã chọn, không có tiểu sử và hai nút X/❤️.
- [x] Kiểm tra typecheck, test, build và preview mobile không phát sinh request hoặc cuộn ngang.
- [x] Khóa /connect trong vùng giữa Header và Bottom Navigation; Card Bí Ẩn tự co theo chiều cao mobile, không cuộn dọc/ngang.
- [x] Kiểm tra FIT-TO-VIEWPORT của Card Bí Ẩn ở 360×568, 375×667, 390×844, 430×932, 1366×768 và 1920×1080.
- [x] Bỏ bio; Card Bí Ẩn hiển thị Ẩn Danh, tuổi ngẫu nhiên đúng khoảng và các lựa chọn loại tìm kiếm, nhu cầu, khu vực từ Setup.
- [x] Khi chọn “Tất cả”, Card Bí Ẩn random client-side một quận/huyện từ đúng tỉnh/thành của user; lựa chọn cụ thể vẫn giữ nguyên.


## /connect — YÊU CẦU KẾT NỐI (2026-09-28)

- [x] Import toàn bộ mã nguồn từ ZIP, giữ nguyên cấu trúc components và cấu hình DB cũ.
- [x] Nút X trên Card Bí Ẩn quay lại Setup, giữ nguyên mọi lựa chọn.
- [x] Nút tim mở màn "YÊU CẦU KẾT NỐI" với avatar hai bên, hiệu ứng kết duyên và countdown 20 giây chạy thật.
- [x] Ba nút demo nhỏ: Đồng ý (chúc mừng + confetti), Từ chối (lý do ngẫu nhiên), Hết giờ; tự hết giờ khi countdown về 0.
- [x] Typecheck, test (7/7 /connect) và build đạt; client-only, không gọi API/database.
- [ ] Xem trực tiếp preview /connect: cần tài khoản đăng nhập của DB cũ (không có trong môi trường này).

## /connect — Khôi phục trạng thái ổn định (2026-09-28)

- [x] Import lại toàn bộ source từ ZIP, giữ nguyên cấu trúc components và cấu hình DB cũ.
- [x] Revert phần chỉnh sửa dở dang: xoá màn "home" KẾT NỐI và khối connect-match không có CSS.
- [x] /connect trở lại luồng ổn định: SET UP TÌM KIẾM → RADAR QUÉT → Card Bí Ẩn → YÊU CẦU KẾT NỐI.
- [x] Typecheck, test 7/7, build và kiểm tra preview mobile/desktop (không cuộn ngang).
- [ ] Xem /connect sau đăng nhập: cần tài khoản của DB cũ (không có trong môi trường này).

## /connect — Màn chính KẾT NỐI (chưa triển khai, chờ yêu cầu mới)

- [ ] Thay Setup mặc định bằng màn KẾT NỐI premium theo reference; giữ nguyên Header, Bottom Navigation và tab KẾT NỐI active.
- [ ] Nút Cài đặt mở lại đúng form SET UP TÌM KIẾM hiện có; thao tác quay lại không làm mất lựa chọn.
- [ ] Nút TÌM chạy matching client-side với hai avatar, tim bay, dấu hỏi xoay, text Đang quét và Compatibility %, không render Radar Quét hoặc tiến trình cũ.
- [ ] Giữ nguyên Card Bí Ẩn và YÊU CẦU KẾT NỐI; nút X trên Card Bí Ẩn quay về màn KẾT NỐI.
- [ ] Có trạng thái không tìm thấy phù hợp, cho phép quay lại màn chính; không thêm API/database.
- [ ] Kiểm tra typecheck, test, build và preview mobile/desktop; mobile không cuộn và desktop không bị cắt.

## /connect — PHẦN 1: màn matching tĩnh
- [x] Hiển thị màn chính avatar tôi — tim 92% minh họa — avatar bí ẩn; Cài đặt mở lại Setup cũ.
- [x] Ngắt luồng quét khỏi giao diện PHẦN 1; giữ mã cũ để dùng sau, không triển khai countdown hay kết quả.
- [x] Test màn chính, Cài đặt và lưu lựa chọn (3/3); build tự động đạt.
- [ ] Xem giao diện /connect sau đăng nhập ở mobile/desktop: bản xem trực tiếp đang chuyển sang trang đăng nhập của DB cũ, chưa có phiên đăng nhập để xác nhận bố cục.

## /connect — redesign màn chính theo Screenshot 2
- [x] Giữ Header, Bottom Navigation và logic tìm kiếm/yêu cầu; màn chính là card trắng hồng với hai avatar, tim và ảnh bí ẩn.
- [x] Chỉ hiển thị trạng thái chờ và đồng hồ khi yêu cầu đã được mở; không hiện nhầm lúc vừa vào trang.
- [x] Kiểm tra giao diện card riêng ở desktop 1280px và mobile 390px/360px; không tràn ngang, hành động chính nằm trong vùng hiển thị.
- [x] Kiểm tra 3 bài test /connect, gồm trạng thái ban đầu, tiến trình tìm và màn yêu cầu chỉ có đồng hồ khi active; preview build OK.
- [ ] Xác nhận trực tiếp /connect sau đăng nhập bằng tài khoản DB cũ: môi trường xem trước hiện không có phiên đăng nhập đó.

## /connect — request-inspired default (2026-09-28)
- [x] Show the request-card composition at rest with explicit unsent status and inactive timer; retain the real 20-second request countdown after liking a mystery card.
- [x] Check /connect tests (4 passed), mobile/desktop fit (360px, 394px, 1280px; no horizontal overflow), and preview diagnostics (build OK).
- [ ] Authenticated in-app preview requires a session for the existing external account; the preview currently redirects to its login screen.

## /connect — tinh gọn trạng thái tìm kiếm (2026-09-28)
- [x] Import toàn bộ source từ ZIP, giữ nguyên cấu trúc components, cấu hình nhiều DB và không chạy SQL.
- [x] Giữ duy nhất countdown 15 giây trong tim trung tâm; bỏ đồng hồ `00:xx`, thanh tiến trình và nội dung tìm kiếm trùng lặp.
- [x] Thêm nhịp tim, glow, ripple và tim nhỏ nhẹ bằng CSS/DOM; có reduced-motion và không thay Header/Bottom Navigation.
- [x] Test `/connect` đạt 4/4 và build OK; trang đăng nhập cũ không tràn ngang ở mobile/desktop, còn màn sau đăng nhập được xác nhận bằng test do môi trường không có phiên tài khoản cũ.

## /connect — cài đặt trước khi tìm (2026-09-28)
- [x] Trạng thái mặc định chỉ còn cặp avatar, tim 0% và nút TÌM KẾT NỐI; bỏ toàn bộ nhãn, mô tả và đồng hồ chờ cũ.
- [x] Thêm lựa chọn khu vực từ hồ sơ/danh sách quận huyện sẵn có, tuổi 18–30, nhu cầu và vóc dáng.
- [x] Giữ nguyên countdown và animation 15 giây; dùng tiêu chí đã chọn cho Card Bí Ẩn mà không thay đổi backend/database.
- [x] Test `/connect` đạt 4/4 và build OK; kiểm tra công khai 394px/1280px không tràn ngang, màn sau đăng nhập được xác nhận bằng test do tài khoản cũ chuyển đến đăng nhập.

## /connect — popup cài đặt (2026-09-28)
- [x] Import lại toàn bộ source từ ZIP, giữ cấu trúc components và cấu hình DB cũ; không chạy migration.
- [x] Giữ màn chính sạch với hai avatar, tim 0%, nút TÌM KẾT NỐI và biểu tượng cài đặt nhỏ.
- [x] Chuyển khu vực, tuổi 18–30, phong cách kết nối và vóc dáng vào modal; chỉ áp dụng khi bấm Lưu.
- [x] Test `/connect` đạt 4/4, Anti Clone đạt 11/11, kiểm tra kiểu dữ liệu và build OK; trang công khai không tràn ngang, còn màn `/connect` sau đăng nhập được xác nhận bằng test do môi trường không có phiên DB cũ.

## /connect — sửa picker và thêm Nhu cầu (2026-09-28)
- [x] Đưa danh sách Khu vực và Độ tuổi lên đúng lớp, không bị cắt và thao tác được trên mobile.
- [x] Tinh chỉnh bố cục popup và thêm lựa chọn đơn Nhu cầu với ba giá trị được yêu cầu.
- [x] Kiểm tra mọi lựa chọn, Lưu/mở lại, cuộn nội bộ, không tràn ngang, test và build.
- [ ] Xem trực tiếp popup sau đăng nhập: môi trường hiện không có phiên của tài khoản DB cũ và `/connect` chuyển tới đăng nhập.

## /connect — sửa thao tác chọn trong popup (2026-09-28)
- [ ] Sửa thực sự thao tác chạm Khu vực và cả hai tuổi; danh sách nổi ngoài vùng cuộn, chọn xong hiện giá trị mới.
- [ ] Tách Phong cách, Nhu cầu, Vóc dáng thành ba khung riêng.
- [ ] Thử toàn bộ luồng chạm/chọn/lưu/mở lại trên mobile, chạy test và kiểm tra build.

## /connect — hai trạng thái trực quan (2026-09-28)
- [x] Trạng thái đầu chỉ có hai avatar, tim 0%, nút tìm kiếm và cài đặt; màn tìm dùng hiệu ứng CSS và không hiện đồng hồ.
- [x] Bỏ tỷ lệ tương thích ngẫu nhiên vì luồng hiện tại không tính điểm thật; giữ 0% trong tim khi tìm và giữ luồng Card Bí Ẩn sau 15 giây.
- [ ] Kiểm tra trực tiếp giao diện đã đăng nhập trên mobile và desktop; tài khoản DB cũ không có phiên đăng nhập trong môi trường này.

## /connect — thẻ thành viên thật (2026-09-28)
- [x] Thay toàn bộ luồng tìm kiếm/cài đặt/Card Bí Ẩn bằng thẻ hồ sơ thành viên thật, không sửa Header/dock hay DB.
- [x] Gắn tim vào hành động yêu thích đã có, X chuyển hồ sơ; không tạo luồng kết nối giả.
- [x] Kiểm tra thẻ với dữ liệu mẫu mô phỏng phản hồi đọc hồ sơ tại 360/394px, X, không tràn ngang; 3 test /connect và 11 test chống clone đạt, build OK.
- [ ] Kiểm tra đọc hồ sơ và tim trên phiên đăng nhập thật: cần tài khoản của DB cũ không có sẵn trong môi trường này.

## Messages — menu nhấn giữ (2026-09-28)
- [x] Thêm đúng bốn thao tác, gồm Chọn nhiều, và giữ nguyên logic Ghim/Tắt thông báo/Xóa.
- [x] Neo menu cạnh hội thoại được tô sáng, tự đổi hướng và không bị cắt trên mobile.
- [ ] Kiểm tra trực tiếp hội thoại đầu/giữa/cuối và thao tác thật: cần phiên đăng nhập tài khoản DB cũ; typecheck, test, build và mobile công khai đã đạt.

## Messages — menu nhấn giữ và xóa nhiều (2026-09-28)
- [x] Thêm “Xóa tất cả” cho đúng các hội thoại đang chọn, dùng lại luồng xóa hiện có.
- [x] Củng cố portal/fixed positioning, chặn click xuyên và triệt click sau long-press trên mobile.
- [x] Kiểm tra mã cho menu đầu/giữa/cuối, 4 hành động, chọn nhiều, thoát X; typecheck và test đạt.
- [ ] Kiểm tra trực tiếp với hội thoại thật sau đăng nhập: cần phiên tài khoản DB cũ không có trong môi trường xem trước.

## Messages — giữ menu sau khi thả tay (2026-09-28)
- [x] Không đóng menu bởi pointerup/touchend của chính lần nhấn giữ.
- [x] Giữ chạm ngoài chặn click xuyên và các hành động menu hoạt động bình thường.
- [x] Typecheck, 14 test hiện có và build preview đều đạt.

## Messages — vị trí menu nhấn giữ (2026-09-28)
- [x] Neo portal theo bounding rect thật của thẻ; chỉ đặt trên hoặc dưới với khoảng cách, không chồng thẻ.
- [x] Cuộn đúng vùng danh sách khi cả hai phía thiếu chỗ và kẹp menu trong biên ngang của visual viewport.
- [ ] Kiểm tra trực tiếp hội thoại đầu/giữa/cuối với dữ liệu thật: cần phiên tài khoản DB cũ không có trong môi trường xem trước.

## Điều hướng Tin nhắn và Nhóm (2026-09-28)
- [x] Tin nhắn chỉ hiển thị hội thoại cá nhân và bỏ tab Nhóm phía trên.
- [x] Mục Nhóm ở thanh dưới mở danh sách nhóm thật; giữ nguyên các mục còn lại.
- [x] Kiểm tra mã luồng mobile và nhấn giữ Tin nhắn; typecheck, 14 test và build đạt; không đổi database/backend.
- [ ] Kiểm tra trực tiếp dữ liệu nhóm/hội thoại sau đăng nhập: môi trường xem trước không có phiên đăng nhập DB cũ.

## HOT — banner và Danh sách Code (2026-09-29)
- [x] Làm mới hai tab HOT, banner responsive và card code; giữ nguyên album, Header và dock.
- [x] Quản trị banner/code có xác minh admin; dữ liệu công khai chỉ đọc, upload Storage hiện có.
- [ ] Soạn schema/RLS cho DB #4 đã xong; áp dụng trên DB cũ chờ quyền truy cập Supabase #4 (workspace không kết nối DB cũ, thiếu khóa máy chủ).
- [ ] Typecheck và kiểm tra trang đăng nhập tại 375/390/430 không overflow; giao diện HOT sau đăng nhập và dữ liệu thật chưa xác minh vì không có phiên DB cũ.

## Trang Nhóm — tab VIP/Hướng Dẫn Vip (2026-09-29)
- [x] Import toàn bộ source/config từ ZIP, giữ nguyên DB cũ và không chạy SQL.
- [x] Xóa tìm kiếm riêng trang Nhóm; đặt Thành Viên Vip bên trái, Hướng Dẫn Vip bên phải và mặc định mở VIP.
- [x] Tab VIP dùng nguyên `bait_groups` do Admin quản lý; tab Hướng Dẫn Vip chỉ hiện placeholder "Hướng dẫn VIP sẽ được cập nhật", không tạo hoặc sao chép dữ liệu.
- [x] Kiểm tra trực tiếp 375px, 390px và 430px; tab chuyển đúng, nhóm VIP hiển thị, placeholder đúng, không tràn ngang và bottom navigation không đổi.

## Profile — bỏ hẳn tiểu sử, UID "Vàng Hoàng Gia" (2026-09-29)
- [x] Xóa toàn bộ UI tiểu sử (bio có nội dung lẫn "Chưa có tiểu sử."), badge UID chiếm đúng chỗ bio cũ cho mọi user.
- [x] Nâng cấp badge: khung vàng kim loại nhiều lớp, mặt trong đen sâu, medallion vương miện, copy icon bên phải.
- [x] Kiểm tra 375/390/430 không tràn ngang (fixture stylesheet thật); build OK.
- [ ] Xác minh trang profile thật sau đăng nhập ở 375/390/430 (chưa có phiên DB cũ).

## Post card — Social contact menu + Message (2026-09-29)
- [ ] Bỏ hoàn toàn lượt xem khỏi hàng hành động, giữ Like và Gift.
- [ ] Thêm nút người + với menu 5 social dùng lại icon và dữ liệu hồ sơ tác giả; mục thiếu dữ liệu luôn hiện nhưng disabled.
- [ ] Thêm nút Nhắn tin mở đúng cuộc trò chuyện và chuyển context trả lời bài viết vào ô soạn.
- [ ] Kiểm tra đóng/neo menu, gửi private message, mobile 375/390/430px, typecheck và build.
- [ ] Không đổi database, migration, Auth, RLS hoặc logic social trên profile.

## Import ZIP và chỉnh menu Post Card (2026-09-30)
- [x] Giữ nguyên mã nguồn và cấu hình DB cũ, không chạy SQL/migration.
- [x] Thay nút người+ bằng Facebook; tạo viền panel và từng mục bằng icon Profile dùng chung.
- [x] Kiểm tra menu trực quan ở 375/390/430 bằng dữ liệu thử, xác nhận không bị cắt và năm mục hiển thị.
- [ ] Xác minh link thật trong phiên đăng nhập DB cũ (môi trường xem trước chưa có phiên).

## Message from Post Card — attached post (2026-09-30)
- [ ] Open a mobile-safe compose popup from Nhắn tin with the original post preview and private-message input.
- [ ] Send through existing chat behavior, then open the author's conversation; show the attached post above the typed message, not a text-only quote.
- [ ] Preserve ordinary messages and database schema; verify rendered flow at 375/390/430 and report any authentication limitation.

## Post Reply compact reference (2026-09-30)
- [x] Render author avatar/name, post date, caption, post ID, and GIF-only media in Chat, its reply draft, and Nhắn tin popup; never render ordinary images or group cards.
- [x] Remove popup scroll body; lock background during composition; keep Post Reply menu disabled and normal messages unchanged.
- [x] Check actual reference component with image, GIF, and group examples at 375/390/430px: readable width, GIF only, author/date/caption/ID, no popup scrollbar or overflow.
- [ ] Verify authenticated send and realtime exchange against old DB: blocked by unavailable session for the existing external DB.

## Feed — sửa nút (+) nổi và form đăng bài chính thức (2026-09-30)
- [x] Nút (+) nổi gọi trực tiếp `composerOpen` của Feed, không gọi `CreatePostView` ở app shell.
- [x] Nút là vòng tròn đen bán trong suốt, dấu cộng trắng, fixed và chỉ hiện khi cuộn xuống.
- [ ] Xác nhận build và kiểm tra luồng cuộn/mở/đóng ở mobile + desktop.

## Import ZIP and Like state polish (2026-09-30)
- [x] Import the complete inspected application source and bundled assets.
- [x] Preserve the existing remote database router, schemas, and Like logic.
- [x] Set Like inactive to white and active to rose/red.
- [x] Keep Like, Report, Facebook, and Message controls at 36px height.
- [x] Verify build and both visual Like states in preview.

## Hydration blank-screen fix (2026-09-30)
- [x] Make the access gate's first server and browser render deterministic.
- [x] Read the device-block flag only after hydration without changing block behavior.
- [x] Verify normal and stored-block states render without hydration errors; build passes.
