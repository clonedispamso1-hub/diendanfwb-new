# Báo cáo bố trí cụm badge Feedback Zalo

## Thay đổi
- `src/components/candy/app-header.tsx`: container chung render `FeedbackZaloEntry` trước và `SeverPicker` sau: Feedback Zalo bên trái, Sever bên phải.
- `src/styles.css`: đổi container thành grid hai cột không xuống hàng, căn giữa theo chiều dọc, khoảng cách ngang 5px; nằm dưới header. Giảm khoảng trống dành cho cụm từ hai hàng xuống một hàng. Dưới 360px chỉ giảm padding ngang và khoảng cách bên trong hai badge để vừa màn hình; giữ icon, chữ, màu, nền, viền, chiều cao và hiệu ứng.
- `AGENTS.md`: ghi lại quy tắc dùng container chung.
- `roadmap.md`: cập nhật trạng thái kiểm tra.
- Báo cáo này: `docs/FEEDBACK-ZALO-BADGE-LAYOUT-REPORT.md`.

Không sửa SeverPicker, FeedbackZaloEntry, route, dữ liệu, cấu hình DB cũ, thanh điều hướng dưới cùng hoặc logic khôi phục cuộn. Chỉ cập nhật chiều cao dành chỗ cho cụm badge trong nội dung trang.

## Kết quả kiểm tra
- `bunx vitest run src/test/feedback-zalo-controls.test.tsx`: **2/2 PASS**; giữ đích điều hướng và nút quay lại chỉ có icon.
- **Build tự động OK**: tín hiệu mới nhất trong `/tmp/observability/build-errors.log` lúc 08:08:01 UTC, 09/10/2026.
- **TypeScript riêng: chưa xác minh**; môi trường không cho chạy typecheck thủ công và không cung cấp kết quả typecheck tự động riêng. Không suy diễn TypeScript PASS từ build OK.
- Playwright với header gốc được render riêng, tại **320, 394, 768, 1280px**: cả hai badge là con trực tiếp của cùng container, Feedback Zalo bên trái Sever, cùng tọa độ y và khoảng cách ngang 5px; mỗi badge cao 32px, không tràn ngang hoặc chồng lấn header. Feedback Zalo rộng khoảng 166.23px; ở 320px rộng 154.23px sau khi giảm padding/gap bên trong.
- Cả bốn độ rộng: mở menu Sever thành công; mở Feedback Zalo và quay lại thành công trong bộ điều hướng kiểm tra; nút quay lại vẫn không có chữ và có vùng bấm 44×44px.
- Đã xem ảnh chụp mobile 394px và 320px: Feedback Zalo bên trái, Sever bên phải trên cùng một hàng dưới header; không xuống hàng. Kiểm tra đo đạc desktop 1280px đạt.
- Lần kiểm tra trang thật ở bước trước: `/` HTTP 200, hiển thị màn hình đăng nhập; kiểm tra mới chỉ render riêng header gốc, không giả lập đăng nhập DB cũ.

## Chưa xác minh
- Không thấy ảnh tham chiếu mới trong tệp đính kèm; bố trí dựa vào mô tả yêu cầu và giữ vị trí Sever đang có.
- Chưa kiểm tra được trang chủ sau đăng nhập với DB cũ, nội dung feed, hành vi cuộn thực tế và khôi phục cuộn trong phiên đăng nhập thật: không có phiên đăng nhập cho dịch vụ ngoài. Các kiểm tra header riêng không thay thế kiểm tra phiên thật.
- Chưa có kết quả TypeScript độc lập như nêu trên.