-- =====================================================================
-- SB1 — AUDIT ONLY (KHÔNG tạo/sửa/xoá gì). Chạy trong SQL Editor SB1.
-- Mục tiêu: liệt kê chính xác các overload send_post_gift_v2 đang tồn tại.
-- =====================================================================

-- 1) Tất cả signature + kiểu tham số thật
SELECT
  p.oid::regprocedure                        AS signature,
  pg_get_function_identity_arguments(p.oid)  AS identity_args,
  pg_get_function_arguments(p.oid)           AS full_args,
  pg_get_function_result(p.oid)              AS returns,
  p.prosecdef                                AS security_definer,
  p.provolatile                              AS volatility
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('send_post_gift_v2', 'send_post_gift')
ORDER BY p.proname, signature;

-- 2) Tên tham số (để đối chiếu với payload PostgREST của frontend:
--    p_post_id, p_receiver_id, p_gift_key, p_amount)
SELECT
  p.oid::regprocedure AS signature,
  p.proargnames       AS arg_names
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'send_post_gift_v2';

-- 3) Quyền EXECUTE hiện tại
SELECT
  p.oid::regprocedure AS signature,
  p.proacl            AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'send_post_gift_v2';
