-- =====================================================================
-- POPUP: mỗi popup/sự kiện là 1 cấu hình riêng, có chu kỳ lặp riêng.
--
-- App KHÔNG còn ghi cột `dont_show_again_option` (trước đây gửi chuỗi '24h'
-- vào cột boolean ⇒ lỗi 22P02). Chu kỳ lặp lưu trong JSON cột `style`
-- (khoá `repeatMinutes`), nên KHÔNG cần thêm cột mới.
--
-- File này chỉ dọn cho an toàn (idempotent):
--   • các cột phụ không được app ghi phải có DEFAULT / cho NULL.
-- Chạy nhiều lần vẫn an toàn.
-- =====================================================================

BEGIN;

ALTER TABLE public.admin_popups ALTER COLUMN dont_show_again_option DROP NOT NULL;
ALTER TABLE public.admin_popups ALTER COLUMN trigger_value DROP NOT NULL;

-- popup_type / trigger_type / animation / status / priority đã có DEFAULT.
-- Bảo đảm style (JSON cấu hình popup) là text và cho phép rỗng.
ALTER TABLE public.admin_popups ALTER COLUMN style DROP NOT NULL;

COMMIT;
