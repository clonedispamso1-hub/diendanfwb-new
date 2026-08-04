-- =====================================================================
-- PHASE 3.5 — XÁC THỰC HỒ SƠ + ĐỘ TIN CẬY
-- KHÔNG sửa SQL cũ. Chỉ thêm cột/bảng/policy mới.
-- Chạy thủ công trên Supabase SQL Editor.
-- =====================================================================

-- 1) Thêm cột verification vào profiles (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verify_reason text;

-- trust_score đã tồn tại; đảm bảo có default
ALTER TABLE public.profiles
  ALTER COLUMN trust_score SET DEFAULT 0;

-- 2) Bảng profile_verifications (đơn riêng cho mỗi lần gửi)
CREATE TABLE IF NOT EXISTS public.profile_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selfie_url text NOT NULL,
  portrait_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_user ON public.profile_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_pv_status ON public.profile_verifications(status);

GRANT SELECT, INSERT, UPDATE ON public.profile_verifications TO authenticated;
GRANT ALL ON public.profile_verifications TO service_role;

ALTER TABLE public.profile_verifications ENABLE ROW LEVEL SECURITY;

-- Chủ tài khoản: xem & gửi
DROP POLICY IF EXISTS pv_self_select ON public.profile_verifications;
CREATE POLICY pv_self_select ON public.profile_verifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS pv_self_insert ON public.profile_verifications;
CREATE POLICY pv_self_insert ON public.profile_verifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin: xem & duyệt tất cả (dựa trên profiles.is_admin sẵn có)
DROP POLICY IF EXISTS pv_admin_all ON public.profile_verifications;
CREATE POLICY pv_admin_all ON public.profile_verifications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- 3) Hàm tính lại trust_score (0-100). KHÔNG đụng tới gem/vip/match.
CREATE OR REPLACE FUNCTION public.recalc_trust_score(_uid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  score integer := 0;
BEGIN
  SELECT verified, avatar, bio, phone, photos, last_seen
    INTO p FROM public.profiles WHERE id = _uid;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF p.verified THEN score := score + 40; END IF;
  IF p.avatar IS NOT NULL AND length(p.avatar) > 0 THEN score := score + 15; END IF;
  IF p.bio IS NOT NULL AND length(p.bio) >= 10 THEN score := score + 10; END IF;
  IF p.phone IS NOT NULL AND length(p.phone) >= 6 THEN score := score + 10; END IF;
  IF p.photos IS NOT NULL AND array_length(p.photos, 1) >= 1 THEN score := score + 15; END IF;
  IF p.last_seen IS NOT NULL AND p.last_seen > now() - interval '7 days' THEN score := score + 10; END IF;

  IF score > 100 THEN score := 100; END IF;

  UPDATE public.profiles SET trust_score = score WHERE id = _uid;
  RETURN score;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_trust_score(uuid) TO authenticated;

-- 4) Duyệt / từ chối (admin)
CREATE OR REPLACE FUNCTION public.approve_verification(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profile_verifications
    SET status='approved', reviewed_by=auth.uid(), reviewed_at=now(), reason=NULL
    WHERE id=_id RETURNING user_id INTO v_user;
  UPDATE public.profiles SET verified=true, verified_at=now(), verify_reason=NULL WHERE id=v_user;
  PERFORM public.recalc_trust_score(v_user);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_verification(_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profile_verifications
    SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), reason=_reason
    WHERE id=_id RETURNING user_id INTO v_user;
  UPDATE public.profiles SET verified=false, verify_reason=_reason WHERE id=v_user;
  PERFORM public.recalc_trust_score(v_user);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_verification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_verification(uuid, text) TO authenticated;

-- 5) Storage bucket riêng cho ảnh xác thực (PRIVATE)
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-photos', 'verification-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: chủ tài khoản upload/đọc thư mục mang user_id của mình
DROP POLICY IF EXISTS vp_own_read ON storage.objects;
CREATE POLICY vp_own_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-photos'
    AND (auth.uid()::text = (storage.foldername(name))[1]
         OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  );

DROP POLICY IF EXISTS vp_own_insert ON storage.objects;
CREATE POLICY vp_own_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
