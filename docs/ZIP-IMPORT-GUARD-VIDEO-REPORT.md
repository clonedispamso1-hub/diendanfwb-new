# Báo cáo import ZIP và chỉnh Guard/video

## Kết quả
- Website mở được ở `/`, HTTP 200, trang đăng nhập cũ hiển thị, không có lỗi JavaScript trong kiểm tra trình duyệt.
- Import đầy đủ mã nguồn, không thiếu file nguồn. Không copy Git metadata, cấu hình .lovable của project cũ hay file routeTree sinh tự động.
- Không bật Cloud mới; không tạo DB, bảng, migration; không thực thi SQL; không upload media.
- `src/integrations/supabase` (6 file), `src/lib/db` (4 file), `supabase` (132 file), `supabase-sql` (114 file) nguyên vẹn so với ZIP.

## File khác nội dung so với ZIP
- `AGENTS.md`
- `bun.lock`
- `package.json`
- `roadmap.md`
- `src/CandyApp.tsx`
- `src/components/imported-page.tsx`
- `src/lib/devtools-guard.ts`
- `src/styles/feed-threads-layout.css`
- `src/components/candy/devtools-guard.tsx`

## File mới phục vụ yêu cầu
- `src/lib/devtools-guard.test.ts`
- `src/components/candy/devtools-guard.test.tsx`
- `docs/ZIP-IMPORT-GUARD-VIDEO-REPORT.md`
- `.lovable/migrate-external-project/ledger.json` được tạo cho project mới, không dùng ledger cũ.

## Các file chỉ đổi vị trí vì yêu cầu của framework
Cấu trúc con và toàn bộ nội dung của 20 file sau giữ nguyên; các route TanStack cũ giữ nguyên. Component khác không thay đổi cấu trúc.
- `src/pages/AccountHistory.tsx` → `src/components/imported-views/AccountHistory.tsx` (nội dung nguyên vẹn)
- `src/pages/ActivityLog.tsx` → `src/components/imported-views/ActivityLog.tsx` (nội dung nguyên vẹn)
- `src/pages/AdminBotsPage.tsx` → `src/components/imported-views/AdminBotsPage.tsx` (nội dung nguyên vẹn)
- `src/pages/AdminPage.tsx` → `src/components/imported-views/AdminPage.tsx` (nội dung nguyên vẹn)
- `src/pages/GemHistory.tsx` → `src/components/imported-views/GemHistory.tsx` (nội dung nguyên vẹn)
- `src/pages/Index.tsx` → `src/components/imported-views/Index.tsx` (nội dung nguyên vẹn)
- `src/pages/Inventory.tsx` → `src/components/imported-views/Inventory.tsx` (nội dung nguyên vẹn)
- `src/pages/NotFound.tsx` → `src/components/imported-views/NotFound.tsx` (nội dung nguyên vẹn)
- `src/pages/Notifications.tsx` → `src/components/imported-views/Notifications.tsx` (nội dung nguyên vẹn)
- `src/pages/Suggested.tsx` → `src/components/imported-views/Suggested.tsx` (nội dung nguyên vẹn)
- `src/pages/VerifyProfile.tsx` → `src/components/imported-views/VerifyProfile.tsx` (nội dung nguyên vẹn)
- `src/pages/VipCommunity.tsx` → `src/components/imported-views/VipCommunity.tsx` (nội dung nguyên vẹn)
- `src/pages/Wallet.tsx` → `src/components/imported-views/Wallet.tsx` (nội dung nguyên vẹn)
- `src/pages/WithdrawPage.tsx` → `src/components/imported-views/WithdrawPage.tsx` (nội dung nguyên vẹn)
- `src/pages/admin/AdminApprovalsPage.tsx` → `src/components/imported-views/admin/AdminApprovalsPage.tsx` (nội dung nguyên vẹn)
- `src/pages/admin/AdminAuthLayout.tsx` → `src/components/imported-views/admin/AdminAuthLayout.tsx` (nội dung nguyên vẹn)
- `src/pages/admin/AdminLoginPage.tsx` → `src/components/imported-views/admin/AdminLoginPage.tsx` (nội dung nguyên vẹn)
- `src/pages/admin/AdminPendingPage.tsx` → `src/components/imported-views/admin/AdminPendingPage.tsx` (nội dung nguyên vẹn)
- `src/pages/admin/AdminRegisterPage.tsx` → `src/components/imported-views/admin/AdminRegisterPage.tsx` (nội dung nguyên vẹn)
- `src/pages/admin/AdminShell.tsx` → `src/components/imported-views/admin/AdminShell.tsx` (nội dung nguyên vẹn)

## Guard
- Bỏ detector khoảng cách cửa sổ và console getter khỏi đường khóa. API detector cũ vẫn tồn tại nhưng fail-open, không timer và không hành động.
- Guest không cài Guard. Login chỉ cài bẫy phím; auth identity cập nhật đồng bộ để callback cũ không khóa sau logout/đổi tài khoản. Không sửa authentication.
- F12, Ctrl+Shift+I/J/C, Cmd+Option+I/J/C (physical key code) khóa ngay theo cách cũ `about:blank`.
- Phím xem source/lưu trang vẫn chặn như cũ nhưng không gây khóa. Không detector resize/orientation/zoom/viewport.
- Mở qua menu trình duyệt hoặc cửa sổ DevTools riêng mà không có keydown đến trang không phát hiện đáng tin cậy; không thêm detector để bù.

## Video: chỉ sửa CSS
- Giữ mức thu nhỏ đã có trong ZIP (350px desktop, 326px tablet, 84% mobile), không thu nhỏ thêm 16% lần thứ hai.
- Bổ sung giới hạn 84% ở màn rộng, căn giữa, khung hiển thị 16:9, object-fit: contain chống crop/méo.
- `src/components/candy/post-media.tsx` byte-identical với ZIP: nguyên URL, metadata, play/pause, native controls và viewer.
- Quan trọng: SingleVideo trong ZIP không có `poster` hay thuộc tính thumbnail. CSS không thể cung cấp một poster thiếu sẵn; giữ nguyên hành vi khung hình đầu từ preload metadata. Không tuyên bố đã đảm bảo thumbnail hiện ngay với mọi video.

## Kiểm thử
- `bunx vitest run`: 16 file, 89 tests PASS; gồm 23 test Guard mới và các regression video/profile/route sẵn có.
- Build tự động: log báo `build OK` sau chỉnh sửa. Không chạy build/typecheck thủ công theo quy định môi trường; không có kết quả typecheck độc lập để tuyên bố.
- Guest browser thật: `/` HTTP 200; F12 và Ctrl+Shift+I không khóa; không pageerror.
- Browser fixture cài production shortcut module: chờ 60 giây thật không khóa; F12/Ctrl+Shift+I/J/C/Cmd+Option+I/J/C chuyển about:blank ngay; gỡ module thì F12 không khóa. Đây KHÔNG phải login/logout tài khoản thật.
- Video component thật với WebM fixture chỉ nằm trong browser interception: 375px → 251.16×141.27; 390px → 263.75×148.36; 430px → 297.36×167.25; 1280px → 350×196.875. Tất cả 16:9, nằm giữa, object-fit contain, native controls; playback và viewer phóng to hoạt động; không pageerror.
- Không sửa URL video app, không upload fixture.
- Lệnh thử mở rộng suite ngoài src bằng `--include` không được Vitest hỗ trợ, nên không chạy được; 89 tests ở trên là toàn bộ suite được cấu hình hiện tại, không bao gồm 4 file `tests/*.test.*`.

## Chưa xác minh / blocker
- Login tài khoản cũ → để yên → shortcut → login lại → logout thực tế: không có session của dịch vụ đăng nhập ngoài trong sandbox. Không giả mạo session hay xin mật khẩu.
- Các chức năng server cũ dùng R2, Cloudinary, Sheets, privileged DB keys: source giữ nguyên nhưng secrets không được ZIP mang sang và chưa có ở project mới. Hoạt động trên dịch vụ cũ không bị sửa; chưa bảo đảm chức năng này chạy tại project mới.
- Không có thumbnail/poster sẵn trong SingleVideo; cần cho phép thay đổi media logic nếu muốn bổ sung poster thật.
