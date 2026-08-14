-- =====================================================================
-- DEVICE APPROVAL V2  (chạy trên DB cũ — không đổi URL/API key/project)
--   • Bỏ HOÀN TOÀN bypass của Admin (Admin cũng chỉ 1 tài khoản/thiết bị).
--   • Clone / seed / tài khoản ảo (tạo từ "Tài khoản thứ hai") → MIỄN duyệt.
--   • Auto Approve ON/OFF + số phút chờ. KHÔNG dùng pg_cron (Supabase không cho
--     sửa schema cron → lỗi "dependent privileges exist"). Lịch chạy nền do
--     Scheduler bên ngoài gọi endpoint POST /api/public/auto-approve-cron.
--   • Link liên hệ Admin hiển thị ở màn hình Pending.
-- Additive + Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Bảng cấu hình chung
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL    ON public.app_settings TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='app_settings' AND policyname='app_settings_admin_read') THEN
    CREATE POLICY app_settings_admin_read ON public.app_settings
      FOR SELECT TO authenticated USING (public.mi_is_admin());
  END IF;
END $$;

INSERT INTO public.app_settings (key, value)
VALUES ('device_approval', jsonb_build_object(
          'auto_approve', false,
          'auto_approve_minutes', 1,
          'admin_contact_link', ''
        ))
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1) Helper: profile này có phải clone/seed/ảo (miễn duyệt) không?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_clone_profile(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j jsonb;
BEGIN
  SELECT to_jsonb(p) INTO j FROM public.profiles p WHERE p.id = p_user;
  IF j IS NULL THEN RETURN false; END IF;
  RETURN COALESCE((j->>'is_virtual')::boolean, false)
      OR COALESCE((j->>'is_seed_account')::boolean, false)
      OR COALESCE((j->>'is_clone')::boolean, false);
END $$;
GRANT EXECUTE ON FUNCTION public.is_clone_profile(uuid) TO authenticated, service_role;

-- Clone/seed luôn approved, kể cả khi được tạo hàng loạt (admin_bulk_signup).
CREATE OR REPLACE FUNCTION public.tg_clone_auto_approved()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := to_jsonb(NEW);
BEGIN
  IF COALESCE((j->>'is_virtual')::boolean, false)
     OR COALESCE((j->>'is_seed_account')::boolean, false)
     OR COALESCE((j->>'is_clone')::boolean, false) THEN
    NEW.approval_status := 'approved';
    NEW.approved_at     := COALESCE(NEW.approved_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_clone_auto_approved ON public.profiles;
CREATE TRIGGER profiles_clone_auto_approved
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_clone_auto_approved();

-- Chuẩn hoá dữ liệu cũ: clone đang pending → approved.
UPDATE public.profiles p
   SET approval_status = 'approved', approved_at = COALESCE(approved_at, now())
 WHERE p.approval_status = 'pending' AND public.is_clone_profile(p.id);

-- ---------------------------------------------------------------------
-- 2) claim_device_signup — KHÔNG còn bypass cho Admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_device_signup(
  p_fingerprint text,
  p_cookie_id   text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_existing public.device_signups;
  v_prior    int := 0;
  v_seq      int := 1;
  v_status   text := 'approved';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'approved', 'seq', 1, 'admin', false);
  END IF;

  -- Clone / seed / tài khoản ảo → miễn cơ chế Device Approval.
  IF public.is_clone_profile(v_uid) THEN
    UPDATE public.profiles SET approval_status = 'approved' WHERE id = v_uid;
    RETURN jsonb_build_object('status', 'approved', 'seq', 1, 'admin', false, 'clone', true);
  END IF;

  -- Idempotent.
  SELECT * INTO v_existing FROM public.device_signups WHERE user_id = v_uid;
  IF v_existing.user_id IS NOT NULL THEN
    SELECT COALESCE(approval_status, 'approved') INTO v_status FROM public.profiles WHERE id = v_uid;
    RETURN jsonb_build_object('status', v_status, 'seq', v_existing.seq, 'admin', false);
  END IF;

  -- Đếm tài khoản KHÁC trên cùng thiết bị. Admin cũng bị tính; chỉ bỏ qua clone/seed.
  SELECT COUNT(DISTINCT d.user_id) INTO v_prior
    FROM public.device_signups d
    JOIN public.profiles p ON p.id = d.user_id
   WHERE d.user_id <> v_uid
     AND NOT public.is_clone_profile(p.id)
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
-- 3) my_approval_status — Admin KHÔNG còn mặc định approved
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_approval_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'status',  COALESCE(p.approval_status, 'approved'),
    'seq',     COALESCE(p.device_account_index, 1),
    'admin',   COALESCE(p.is_admin, false),
    'reason',  p.approval_reason,
    'contact', COALESCE((SELECT s.value->>'admin_contact_link'
                           FROM public.app_settings s WHERE s.key = 'device_approval'), '')
  )
  FROM public.profiles p WHERE p.id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.my_approval_status() TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Danh sách chờ duyệt — gồm cả Admin, loại trừ clone
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_pending_signups()
RETURNS TABLE (
  id uuid, public_id text, username text, full_name text, phone text, avatar text,
  created_at timestamptz, requested_at timestamptz, fingerprint text, cookie_id text,
  device_index smallint, reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(p.public_id::text, LEFT(p.id::text, 8)),
         p.username, p.full_name, p.phone, p.avatar, p.created_at,
         COALESCE(p.approval_requested_at, p.created_at),
         COALESCE(p.signup_fingerprint, d.fingerprint),
         COALESCE(p.signup_cookie_id, d.cookie_id),
         COALESCE(p.device_account_index, d.seq, 1)::smallint,
         p.approval_reason
    FROM public.profiles p
    LEFT JOIN public.device_signups d ON d.user_id = p.id
   WHERE p.approval_status = 'pending'
     AND NOT public.is_clone_profile(p.id)
     AND public.mi_is_admin()
   ORDER BY COALESCE(p.approval_requested_at, p.created_at) DESC
   LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION public.admin_pending_signups() TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Cấu hình Auto Approve + Link liên hệ Admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.device_approval_settings()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
        'auto_approve',         COALESCE((s.value->>'auto_approve')::boolean, false),
        'auto_approve_minutes', GREATEST(1, COALESCE((s.value->>'auto_approve_minutes')::int, 1)),
        'admin_contact_link',   COALESCE(s.value->>'admin_contact_link', '')
      ) FROM public.app_settings s WHERE s.key = 'device_approval'),
    jsonb_build_object('auto_approve', false, 'auto_approve_minutes', 1, 'admin_contact_link', '')
  );
$$;
GRANT EXECUTE ON FUNCTION public.device_approval_settings() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_device_approval_settings(
  p_auto boolean, p_minutes int, p_link text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('device_approval', jsonb_build_object(
            'auto_approve', COALESCE(p_auto, false),
            'auto_approve_minutes', GREATEST(1, COALESCE(p_minutes, 1)),
            'admin_contact_link', COALESCE(p_link, '')
          ), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  RETURN public.device_approval_settings();
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_device_approval_settings(boolean, int, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) Auto Approve chạy nền — KHÔNG dùng pg_cron.
--    Lịch chạy do Scheduler bên ngoài (Vercel Cron / Edge Function Scheduler)
--    gọi POST /api/public/auto-approve-cron mỗi phút với header x-cron-secret.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_approve_pending_signups()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg     jsonb := public.device_approval_settings();
  v_minutes int;
  v_count   int := 0;
BEGIN
  IF COALESCE((v_cfg->>'auto_approve')::boolean, false) = false THEN RETURN 0; END IF;
  v_minutes := GREATEST(1, COALESCE((v_cfg->>'auto_approve_minutes')::int, 1));

  WITH upd AS (
    UPDATE public.profiles p
       SET approval_status = 'approved',
           approved_at     = now(),
           approval_reason = 'Tự động phê duyệt sau ' || v_minutes || ' phút'
     WHERE p.approval_status = 'pending'
       AND COALESCE(p.approval_requested_at, p.created_at) <= now() - (v_minutes || ' minutes')::interval
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_count FROM upd;

  UPDATE public.device_signups d
     SET status = 'approved'
   WHERE d.status = 'pending'
     AND EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = d.user_id AND p.approval_status = 'approved');

  RETURN v_count;
END $$;
-- anon: để Scheduler gọi được bằng publishable key (endpoint đã chặn bằng CRON_SECRET).
GRANT EXECUTE ON FUNCTION public.auto_approve_pending_signups() TO anon, authenticated, service_role;

-- Dọn lịch pg_cron cũ nếu trước đây đã tạo (an toàn khi chưa có extension).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      EXECUTE $q$SELECT cron.unschedule(jobid) FROM cron.job
               WHERE jobname = 'auto_approve_pending_signups'$q$;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- không có quyền trên schema cron → bỏ qua
    END;
  END IF;
END $$;
