-- ============================================================
-- INSPECTION ONLY — chạy TỪNG block trên Supabase SQL Editor.
-- KHÔNG tạo/sửa/xoá bất cứ thứ gì. Dùng để xác nhận schema thật
-- trước khi chạy file migration 2026-07-03_final_polish_v2_SAFE.sql
-- ============================================================

-- 1) Cột thật của các bảng liên quan
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('notifications','comments','posts','profiles','gifs','gif_categories')
ORDER BY table_name, ordinal_position;

-- 2) Bảng gifs / gif_categories đã tồn tại chưa?
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('gifs','gif_categories');

-- 3) Index hiện có của notifications & comments
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('notifications','comments')
ORDER BY tablename, indexname;

-- 4) RLS policies hiện có
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('notifications','comments','gifs','gif_categories')
ORDER BY tablename, policyname;

-- 5) Trigger hiện có
SELECT event_object_table AS table_name, trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema='public'
  AND event_object_table IN ('notifications','comments','posts')
ORDER BY event_object_table, trigger_name;

-- 6) Hàm public.has_role có tồn tại không (nếu không, đổi USING trong migration)?
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('has_role','notifications_upsert_like','notifications_unread_count');
