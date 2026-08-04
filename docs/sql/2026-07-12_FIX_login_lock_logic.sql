-- =====================================================================
-- FIX: Sai logic khoá tài khoản (chạy 1 lần trong Supabase SQL Editor)
-- Idempotent — chạy lại không gây lỗi.
--
-- Nguyên nhân gốc:
--   docs/sql/2026-06-14_reports_keyword_system.sql tạo trigger
--   `trg_profile_auto_suspend` + function `_profile_auto_suspend()`.
--   Trigger này tự set `is_banned = true, account_status = 'suspended'`
--   MỖI KHI reputation_score < 70. Vì vậy tài khoản đã được Admin mở
--   khoá vẫn bị khoá lại ngay lần UPDATE kế tiếp -> đăng nhập bị chặn.
--
-- Logic đúng:
--   - trust_score / reputation_score CHỈ là điểm uy tín (hiển thị).
--   - Đăng nhập được / không được CHỈ do `account_status` quyết định:
--       active   -> cho phép
--       pending  -> chờ admin duyệt
--       suspended / banned / banned_15 -> khoá
--   - Rule "2 tài khoản / 1 thiết bị" chỉ áp dụng khi ĐĂNG KÝ.
--   - Admin (is_admin = true) luôn bỏ qua mọi rule khoá.
-- =====================================================================

-- 1) Gỡ trigger + function auto-suspend
DROP TRIGGER IF EXISTS trg_profile_auto_suspend ON public.profiles;
DROP FUNCTION IF EXISTS public._profile_auto_suspend();

-- 2) Đảm bảo tài khoản Admin luôn active
UPDATE public.profiles
SET is_banned = false,
    account_status = 'active'
WHERE is_admin = true;

-- 3) Mở khoá các tài khoản user thường bị auto-suspend không có ban_reason
--    (chắc chắn là do trigger cũ tự set, không phải Admin cố ý khoá).
UPDATE public.profiles
SET is_banned = false,
    account_status = 'active'
WHERE COALESCE(is_admin, false) = false
  AND account_status = 'suspended'
  AND (ban_reason IS NULL OR btrim(ban_reason) = '');

-- 4) Default hợp lý cho account_status
ALTER TABLE public.profiles
  ALTER COLUMN account_status SET DEFAULT 'active';

-- 5) Ràng buộc giá trị account_status hợp lệ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active','pending','suspended','banned','banned_15'));
  END IF;
END $$;
