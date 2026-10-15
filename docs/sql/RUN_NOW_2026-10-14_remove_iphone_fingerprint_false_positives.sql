-- =====================================================================
-- Gỡ 11 fingerprint phần cứng trùng cấu hình iPhone phổ biến (chặn nhầm).
-- Chạy trên Supabase #1 (SQL Editor). Idempotent.
-- Bản JSON backup: docs/sql/backups/2026-10-14_blocked_devices_backup.json
-- KHÔNG đụng profiles.ban_level (khóa tài khoản vi phạm vẫn giữ nguyên),
-- KHÔNG đụng blocked_cookies (device_id riêng từng máy), blocked_ips, bảng khác.
-- =====================================================================

-- 1. Backup trong DB
CREATE TABLE IF NOT EXISTS public.blocked_devices_backup_20261014
  AS TABLE public.blocked_devices WITH NO DATA;
INSERT INTO public.blocked_devices_backup_20261014
SELECT * FROM public.blocked_devices b
 WHERE NOT EXISTS (SELECT 1 FROM public.blocked_devices_backup_20261014 x WHERE x.id = b.id);
REVOKE ALL ON public.blocked_devices_backup_20261014 FROM anon, authenticated;

-- 2. Xoá fingerprint trùng iPhone phổ biến
DELETE FROM public.blocked_devices
 WHERE ip IS NULL AND fingerprint IN (
   '5e4650fb','5782b593','903c5b8d','c6d9ce40','e4ec9180','08512dfa',
   'e3cf4043','70128b8b','77a7536f','0ed352ad','0ffc8372'
 );

-- 3. device_is_blocked: chỉ chặn theo device_id ngẫu nhiên (blocked_cookies),
--    bỏ nhánh fingerprint phần cứng.
CREATE OR REPLACE FUNCTION public.device_is_blocked(
  p_fingerprint text DEFAULT NULL,
  p_cookie text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_cookies c
     WHERE p_cookie IS NOT NULL AND c.cookie_id = p_cookie
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.device_is_blocked(text, text) TO anon, authenticated, service_role;
