-- ============================================================
-- DEBUG SQL — chạy TỪNG block một, KHÔNG chạy cả file cùng lúc.
-- Mục đích: xác nhận schema trước khi chạy migration v3.
-- KHÔNG tạo bảng, KHÔNG tạo index, KHÔNG sửa dữ liệu.
-- ============================================================


-- ------------------------------------------------------------
-- SQL 1) Liệt kê toàn bộ cột hiện có trong bảng public.posts
-- ------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'posts'
ORDER BY ordinal_position;


-- ------------------------------------------------------------
-- SQL 2) Liệt kê toàn bộ index hiện có của bảng public.posts
--        + định nghĩa đầy đủ (để phát hiện index nào dùng now()).
-- ------------------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'posts'
ORDER BY indexname;

-- (Phụ) Cảnh báo: tìm bất kỳ index nào còn chứa now()/current_timestamp/clock_timestamp
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'posts'
  AND (indexdef ILIKE '%now()%'
       OR indexdef ILIKE '%current_timestamp%'
       OR indexdef ILIKE '%clock_timestamp%');


-- ------------------------------------------------------------
-- SQL 3) Kiểm tra bảng public.comments có tồn tại không
-- ------------------------------------------------------------
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name   = 'comments'
) AS comments_exists;

-- Nếu tồn tại, xem các cột:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'comments'
ORDER BY ordinal_position;


-- ------------------------------------------------------------
-- SQL 4) Kiểm tra bảng public.post_gifts có tồn tại không
-- ------------------------------------------------------------
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name   = 'post_gifts'
) AS post_gifts_exists;

-- Nếu tồn tại, xem các cột:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'post_gifts'
ORDER BY ordinal_position;
