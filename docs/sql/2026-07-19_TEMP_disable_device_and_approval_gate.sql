-- =====================================================================
-- TẠM THỜI TẮT: giới hạn thiết bị + gate phê duyệt tài khoản mới.
-- Chạy 1 lần trong Supabase SQL Editor. Idempotent.
--
-- Mục tiêu:
--   1) `register_device_fingerprint` / `check_device_quota` không còn
--      ghi dữ liệu hay chặn đăng ký. Vẫn giữ hàm để client gọi không lỗi.
--   2) Tài khoản mới KHÔNG bị đặt `approval_status = 'pending'` nữa,
--      mà mặc định = 'approved' để đăng nhập được ngay.
--   3) Mở khoá các tài khoản đang pending do trigger cũ.
--
-- Khi muốn bật lại: chạy lại file `2026-07-10_task5_auth_hardening.sql`
-- (nó dùng CREATE OR REPLACE nên sẽ khôi phục logic gốc).
-- =====================================================================

-- 1) Vô hiệu hoá RPC device -------------------------------------------
CREATE OR REPLACE FUNCTION public.check_device_quota(
  p_fingerprint text,
  p_ip          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ok', true, 'count', 0, 'limit', 999999, 'note', 'temp_disabled');
$$;
GRANT EXECUTE ON FUNCTION public.check_device_quota(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_device_fingerprint(
  p_fingerprint text,
  p_ip          text DEFAULT NULL,
  p_ua          text DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT; -- no-op: tạm thời không ghi device_registrations
$$;
GRANT EXECUTE ON FUNCTION public.register_device_fingerprint(text, text, text) TO anon, authenticated;

-- 2) Tắt gate approval cho tài khoản mới ------------------------------
CREATE OR REPLACE FUNCTION public.set_default_approval_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- TẠM THỜI: luôn approved. Bản gốc set 'pending' cho user thường.
  NEW.approval_status := 'approved';
  RETURN NEW;
END;
$$;

-- Đảm bảo trigger vẫn tồn tại và trỏ tới hàm ở trên.
DROP TRIGGER IF EXISTS trg_profiles_default_approval ON public.profiles;
CREATE TRIGGER trg_profiles_default_approval
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_default_approval_status();

-- Đổi default cột để insert trực tiếp cũng approved.
ALTER TABLE public.profiles
  ALTER COLUMN approval_status SET DEFAULT 'approved';

-- 3) Mở khoá các tài khoản đang pending do trigger cũ -----------------
UPDATE public.profiles
   SET approval_status = 'approved'
 WHERE approval_status IS DISTINCT FROM 'approved'
   AND approval_status <> 'rejected';  -- giữ nguyên các tài khoản admin đã từ chối
