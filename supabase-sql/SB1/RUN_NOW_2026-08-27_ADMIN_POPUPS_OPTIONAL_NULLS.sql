-- =====================================================================
-- FIX LỖI LƯU POPUP:
--   null value in column "button_url" of relation "admin_popups"
--   violates not-null constraint
--
-- Các trường TÙY CHỌN của popup phải cho phép NULL vì popup có thể
-- không có link / không có nút / không có ảnh / không có mô tả.
--
-- CHỈ sửa schema public.admin_popups (SB1). Idempotent — chạy nhiều lần an toàn.
-- =====================================================================

BEGIN;

-- Các cột tùy chọn: cho phép NULL
ALTER TABLE public.admin_popups ALTER COLUMN button_url  DROP NOT NULL;
ALTER TABLE public.admin_popups ALTER COLUMN button_text DROP NOT NULL;
ALTER TABLE public.admin_popups ALTER COLUMN image_url   DROP NOT NULL;
ALTER TABLE public.admin_popups ALTER COLUMN description DROP NOT NULL;

-- Phòng hờ: các cột phụ khác app có thể không ghi
ALTER TABLE public.admin_popups ALTER COLUMN popup_type   DROP NOT NULL;
ALTER TABLE public.admin_popups ALTER COLUMN trigger_type DROP NOT NULL;
ALTER TABLE public.admin_popups ALTER COLUMN animation    DROP NOT NULL;
ALTER TABLE public.admin_popups ALTER COLUMN target_pages DROP NOT NULL;

-- Gán DEFAULT an toàn cho các cột thường dùng (nếu chưa có)
ALTER TABLE public.admin_popups ALTER COLUMN status   SET DEFAULT 'disabled';
ALTER TABLE public.admin_popups ALTER COLUMN priority SET DEFAULT 5;

COMMIT;

-- Kiểm tra lại sau khi chạy:
--   SELECT column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'admin_popups'
--   ORDER BY ordinal_position;
