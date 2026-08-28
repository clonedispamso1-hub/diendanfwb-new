-- =====================================================================
-- SB1 — FIX: "function send_post_gift_v2(...) is not unique" (ambiguous)
-- Chạy trong SQL Editor của Supabase #1.
-- KHÔNG drop bảng, KHÔNG xoá dữ liệu, KHÔNG đổi logic Gem/quà.
-- Chỉ giữ duy nhất signature frontend đang gọi:
--   (p_post_id uuid, p_receiver_id uuid, p_gift_key text, p_amount bigint)
-- =====================================================================

-- 1) Xem toàn bộ overload hiện có (chạy riêng để kiểm tra trước/sau)
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'send_post_gift_v2';

-- 2) DROP an toàn mọi overload KHÁC signature chuẩn
DO $$
DECLARE
  keep_sig text := 'public.send_post_gift_v2(uuid,uuid,text,bigint)';
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'send_post_gift_v2'
      AND p.oid::regprocedure::text <> keep_sig
  LOOP
    RAISE NOTICE 'Dropping overload: %', r.sig;
    EXECUTE format('DROP FUNCTION IF EXISTS %s;', r.sig);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'send_post_gift_v2'
      AND p.oid::regprocedure::text = keep_sig
  ) THEN
    RAISE EXCEPTION 'Signature chuẩn % không tồn tại — DỪNG, không tạo mới, hãy kiểm tra lại.', keep_sig;
  END IF;
END $$;

-- 3) Quyền gọi cho user đã đăng nhập
REVOKE ALL ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) TO service_role;

-- 4) Xác nhận chỉ còn đúng 1 hàm
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'send_post_gift_v2';
