-- =========================================================================
-- Thêm giá trị 'general' vào enum public.post_category để bài "Trang Chủ"
-- được lưu đúng category thay vì fallback sang 'ons'.
-- Idempotent — chạy lại nhiều lần vẫn an toàn.
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'post_category' AND e.enumlabel = 'general'
  ) THEN
    ALTER TYPE public.post_category ADD VALUE 'general';
  END IF;
END $$;