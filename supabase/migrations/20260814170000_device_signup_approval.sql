-- =====================================================================
-- CƠ CHẾ ĐĂNG KÝ THEO THIẾT BỊ (fingerprint + cookie)
--   • Tài khoản ĐẦU TIÊN trên 1 thiết bị  → approved ngay.
--   • Tài khoản THỨ 2 trở đi trên thiết bị → pending (chờ Admin duyệt).
--   • KHÔNG dùng IP để quyết định. KHÔNG khóa tài khoản nào.
--   • Admin & các tài khoản đang hoạt động sẵn KHÔNG bị ảnh hưởng.
--   • Pending > 24h chưa duyệt → tự động xoá (Auth + Profile + Avatar + dữ liệu).
-- Additive + Idempotent. Không đổi Supabase URL / API key / project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Cột trạng thái phê duyệt trên profiles
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status      text,
  ADD COLUMN IF NOT EXISTS approval_reason      text,
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at          timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by          uuid,
  ADD COLUMN IF NOT EXISTS signup_fingerprint   text,
  ADD COLUMN IF NOT EXISTS signup_cookie_id     text,
  ADD COLUMN IF NOT EXISTS device_account_index smallint;

-- Mọi tài khoản đã tồn tại (trước migration) mặc định là approved.
UPDATE public.profiles
   SET approval_status = 'approved'
 WHERE approval_status IS NULL;

ALTER TABLE public.profiles ALTER COLUMN approval_status SET DEFAULT 'approved';

CREATE INDEX IF NOT EXISTS profiles_approval_status_idx
  ON public.profiles(approval_status)
  WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS profiles_signup_fp_idx     ON public.profiles(signup_fingerprint);
CREATE INDEX IF NOT EXISTS profiles_signup_cookie_idx ON public.profiles(signup_cookie_id);

-- ---------------------------------------------------------------------
-- 2) Sổ đăng ký theo thiết bị (nguồn sự thật cho "thứ tự tài khoản")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_signups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  fingerprint  text,
  cookie_id    text,
  seq          smallint NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'approved',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS device_signups_user_uidx ON public.device_signups(user_id);
CREATE INDEX IF NOT EXISTS device_signups_fp_idx     ON public.device_signups(fingerprint);
CREATE INDEX IF NOT EXISTS device_signups_cookie_idx ON public.device_signups(cookie_id);

ALTER TABLE public.device_signups ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.device_signups TO authenticated;
GRANT ALL    ON public.device_signups TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='device_signups' AND policyname='device_signups_self_read') THEN
    CREATE POLICY device_signups_self_read ON public.device_signups
      FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.mi_is_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) Đăng ký thiết bị cho tài khoản vừa tạo (gọi 1 lần sau signUp)
--    Trả về: { status, seq, admin }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_device_signup(
  p_fingerprint text,
  p_cookie_id   text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_admin    boolean := false;
  v_existing public.device_signups;
  v_prior    int := 0;
  v_seq      int := 1;
  v_status   text := 'approved';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'approved', 'seq', 1, 'admin', false);
  END IF;

  SELECT COALESCE(is_admin, false) INTO v_admin FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_admin, false) THEN
    UPDATE public.profiles SET approval_status = 'approved' WHERE id = v_uid;
    RETURN jsonb_build_object('status', 'approved', 'seq', 1, 'admin', true);
  END IF;

  -- Idempotent: đã ghi nhận rồi thì trả lại trạng thái hiện tại.
  SELECT * INTO v_existing FROM public.device_signups WHERE user_id = v_uid;
  IF v_existing.user_id IS NOT NULL THEN
    SELECT COALESCE(approval_status, 'approved') INTO v_status FROM public.profiles WHERE id = v_uid;
    RETURN jsonb_build_object('status', v_status, 'seq', v_existing.seq, 'admin', false);
  END IF;

  -- Đếm số tài khoản khác đã đăng ký trên CÙNG thiết bị (fingerprint HOẶC cookie).
  SELECT COUNT(DISTINCT d.user_id) INTO v_prior
    FROM public.device_signups d
    JOIN public.profiles p ON p.id = d.user_id
   WHERE d.user_id <> v_uid
     AND COALESCE(p.is_admin, false) = false
     AND (
       (p_fingerprint IS NOT NULL AND p_fingerprint <> '' AND d.fingerprint = p_fingerprint)
       OR (p_cookie_id IS NOT NULL AND p_cookie_id <> '' AND d.cookie_id = p_cookie_id)
     );

  v_seq := v_prior + 1;
  v_status := CASE WHEN v_seq <= 1 THEN 'approved' ELSE 'pending' END;

  INSERT INTO public.device_signups (user_id, fingerprint, cookie_id, seq, status)
  VALUES (v_uid, NULLIF(p_fingerprint, ''), NULLIF(p_cookie_id, ''), v_seq, v_status)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.profiles
     SET approval_status       = v_status,
         signup_fingerprint    = COALESCE(NULLIF(p_fingerprint, ''), signup_fingerprint),
         signup_cookie_id      = COALESCE(NULLIF(p_cookie_id, ''), signup_cookie_id),
         device_account_index  = v_seq,
         approval_requested_at = CASE WHEN v_status = 'pending' THEN now() ELSE approval_requested_at END,
         approval_reason       = CASE WHEN v_status = 'pending'
                                     THEN 'Tài khoản thứ ' || v_seq || ' trên cùng thiết bị'
                                     ELSE approval_reason END,
         approved_at           = CASE WHEN v_status = 'approved' THEN now() ELSE approved_at END
   WHERE id = v_uid;

  RETURN jsonb_build_object('status', v_status, 'seq', v_seq, 'admin', false);
END $$;

GRANT EXECUTE ON FUNCTION public.claim_device_signup(text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Kiểm tra trạng thái của chính mình (dùng cho nút "Kiểm tra lại")
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_approval_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'status', CASE WHEN COALESCE(p.is_admin, false) THEN 'approved'
                   ELSE COALESCE(p.approval_status, 'approved') END,
    'seq',    COALESCE(p.device_account_index, 1),
    'admin',  COALESCE(p.is_admin, false),
    'reason', p.approval_reason
  )
  FROM public.profiles p WHERE p.id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.my_approval_status() TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Admin: danh sách chờ phê duyệt
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_pending_signups()
RETURNS TABLE (
  id uuid,
  public_id text,
  username text,
  full_name text,
  phone text,
  avatar text,
  created_at timestamptz,
  requested_at timestamptz,
  fingerprint text,
  cookie_id text,
  device_index smallint,
  reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(p.public_id::text, LEFT(p.id::text, 8)),
         p.username,
         p.full_name,
         p.phone,
         p.avatar,
         p.created_at,
         COALESCE(p.approval_requested_at, p.created_at),
         COALESCE(p.signup_fingerprint, d.fingerprint),
         COALESCE(p.signup_cookie_id, d.cookie_id),
         COALESCE(p.device_account_index, d.seq, 1)::smallint,
         p.approval_reason
    FROM public.profiles p
    LEFT JOIN public.device_signups d ON d.user_id = p.id
   WHERE p.approval_status = 'pending'
     AND COALESCE(p.is_admin, false) = false
     AND public.mi_is_admin()
   ORDER BY COALESCE(p.approval_requested_at, p.created_at) DESC
   LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION public.admin_pending_signups() TO authenticated;

-- ---------------------------------------------------------------------
-- 6) Admin: phê duyệt / từ chối
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_approval(p_user uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN RAISE EXCEPTION 'bad status'; END IF;

  UPDATE public.profiles
     SET approval_status = p_status,
         approved_at     = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
         approved_by     = auth.uid()
   WHERE id = p_user;

  UPDATE public.device_signups SET status = p_status WHERE user_id = p_user;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_approval(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Xoá hoàn toàn 1 tài khoản (Auth + Profile + Avatar + dữ liệu liên quan)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_account_cascade(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avatar text;
BEGIN
  IF p_user IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND COALESCE(is_admin,false)) THEN
    RETURN false; -- không bao giờ xoá admin
  END IF;

  SELECT avatar INTO v_avatar FROM public.profiles WHERE id = p_user;

  -- Avatar / file trong Storage (best-effort, bỏ qua nếu không có quyền).
  BEGIN
    DELETE FROM storage.objects
     WHERE (bucket_id IN ('avatars','media','uploads'))
       AND (name LIKE p_user::text || '%' OR (v_avatar IS NOT NULL AND v_avatar LIKE '%' || name));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  DELETE FROM public.device_signups WHERE user_id = p_user;

  -- Profile (các bảng phụ thuộc thường có FK ON DELETE CASCADE).
  BEGIN DELETE FROM public.profiles WHERE id = p_user; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Auth user (kéo theo mọi FK tới auth.users).
  BEGIN DELETE FROM auth.users WHERE id = p_user; EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_pending_account(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.purge_account_cascade(p_user);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_pending_account(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Tự động xoá pending quá 24 giờ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_stale_pending_accounts()
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
     WHERE approval_status = 'pending'
       AND COALESCE(is_admin, false) = false
       AND COALESCE(approval_requested_at, created_at) < now() - interval '24 hours'
     LIMIT 200
  LOOP
    IF public.purge_account_cascade(r.id) THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.purge_stale_pending_accounts() TO anon, authenticated;

-- pg_cron đã được gỡ khỏi migration này (project không bật extension pg_cron).
-- Gọi thủ công khi cần dọn dẹp:
--   SELECT public.purge_stale_pending_accounts();
-- hoặc lên lịch bằng Edge Function / cron bên ngoài.
