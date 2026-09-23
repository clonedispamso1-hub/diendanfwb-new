# Roadmap

## Import ZIP + giữ DB cũ
- [x] Giải nén và import toàn bộ file ZIP vào project (giữ nguyên components).
- [x] Giữ nguyên cấu hình Supabase #1/#2/#3 cũ (src/lib/db/config.ts) — không tạo DB mới.
- [x] Cài đặt dependencies, website chạy lại (HTTP 200).

## Xoá module "Cá" (chỉ module này)
- [x] Dry-run: 14 / 108 / 5 / 36 / 10 — khớp tuyệt đối.
- [x] Chỉ xoá nếu khớp tuyệt đối 14 / 108 / 5 / 36 / 10.
- [x] Verification đầy đủ trước/sau (bao gồm gem_transactions không đổi).
- [x] Không chạy module "Bài viết" và "Tố Cáo Nhận Thưởng".

## A1 — Security Chat (SB3)
- [x] Import ZIP, giữ nguyên components + cấu hình Supabase #1/#2/#3, web chạy HTTP 200.
- [x] Xoá đúng 1 bản ghi audit messages.id = a17c8491-203d-421e-b7a8-8c84d93d1563 (còn 11 message thật).
- [x] Audit anon trên 5 bảng chat (SB3): SELECT/INSERT/UPDATE/DELETE đều mở.
- [ ] Siết RLS — BỊ CHẶN: chat chạy bằng anon key trên SB3, session lại ở SB1 → auth.uid() luôn NULL trên SB3.
      Cần bật Third-Party Auth (JWKS của SB1) trên SB3 trước khi viết policy theo auth.uid().
