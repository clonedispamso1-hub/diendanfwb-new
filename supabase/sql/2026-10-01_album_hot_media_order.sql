-- ⚡ ALBUM HOT — chạy trên Supabase #4 (ybzdpxwbpbkeqkqwbscp) bằng SQL Editor.
-- Chỉ thay đổi tối thiểu, KHÔNG xóa/sửa dữ liệu hiện có. Chạy lại nhiều lần vẫn an toàn.

-- 1) Thứ tự hiển thị media
ALTER TABLE public.flash_album_media ADD COLUMN IF NOT EXISTS display_order integer;

-- Điền thứ tự cho media cũ theo thời gian tạo (chỉ những dòng chưa có)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY album_id ORDER BY created_at, id) - 1 AS rn
  FROM public.flash_album_media
)
UPDATE public.flash_album_media m
SET display_order = r.rn
FROM ranked r
WHERE m.id = r.id AND m.display_order IS NULL;

CREATE INDEX IF NOT EXISTS flash_album_media_album_order_idx
  ON public.flash_album_media (album_id, display_order);

-- 2) Media thêm bằng URL không cần storage_path
ALTER TABLE public.flash_album_media ALTER COLUMN storage_path DROP NOT NULL;

-- 3) Nếu cột code có CHECK giới hạn dạng ABC-123 thì mới cần nới ra để nhận Code cũ (vd E118A4AE).
--    Kiểm tra trước:
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.flash_albums'::regclass AND contype = 'c';
--    Nếu có constraint về code, thay bằng:
--    ALTER TABLE public.flash_albums DROP CONSTRAINT <ten_constraint>;
--    ALTER TABLE public.flash_albums ADD CONSTRAINT flash_albums_code_format
--      CHECK (code ~ '^[A-Z0-9-]{4,20}$');
