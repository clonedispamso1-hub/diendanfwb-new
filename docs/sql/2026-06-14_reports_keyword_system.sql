-- =====================================================================
-- NÂNG CẤP HỆ THỐNG TỐ CÁO REAL-TIME + ĐIỂM UY TÍN + BOT TỪ CẤM
-- Chạy 1 lần trong SQL Editor (DB: zbuwddjcqdlyijcunwgd). Idempotent.
-- =====================================================================

-- 1) profiles: reputation_score (mặc định 100) + auto khoá khi < 70
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reputation_score INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

-- Trigger: khi điểm uy tín thay đổi
--   < 70  => is_banned = true  + account_status = 'suspended'  (tự khoá + đăng xuất)
--   >= 70 => is_banned = false + account_status = 'active'     (chỉ admin nâng điểm mới mở lại)
CREATE OR REPLACE FUNCTION public._profile_auto_suspend()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.reputation_score, 100) < 70 THEN
    NEW.is_banned := true;
    NEW.account_status := 'suspended';
  ELSE
    NEW.is_banned := false;
    NEW.account_status := 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_auto_suspend ON public.profiles;
CREATE TRIGGER trg_profile_auto_suspend
BEFORE INSERT OR UPDATE OF reputation_score ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._profile_auto_suspend();

-- 2) user_reports: thêm cột nếu thiếu + bật realtime
ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS post_id UUID,
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS penalty_applied INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_by UUID,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- backfill post_id từ context khi context_type='post'
UPDATE public.user_reports
SET post_id = context_id::uuid
WHERE post_id IS NULL
  AND context_type = 'post'
  AND context_id IS NOT NULL
  AND context_id ~ '^[0-9a-f-]{36}$';

ALTER TABLE public.user_reports REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_reports'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_reports';
  END IF;
END $$;

-- 3) banned_keywords (ẩn với user thường — không có policy SELECT công khai)
CREATE TABLE IF NOT EXISTS public.banned_keywords (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  normalized TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  penalty INT NOT NULL DEFAULT 15,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_banned_keywords_normalized ON public.banned_keywords (normalized);

GRANT SELECT ON public.banned_keywords TO authenticated;
GRANT ALL ON public.banned_keywords TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.banned_keywords_id_seq TO authenticated;

ALTER TABLE public.banned_keywords ENABLE ROW LEVEL SECURITY;

-- Chỉ admin được đọc danh sách từ cấm (ẩn với user thường).
DROP POLICY IF EXISTS "kw_select_auth" ON public.banned_keywords;
DROP POLICY IF EXISTS "kw_admin_select" ON public.banned_keywords;
CREATE POLICY "kw_admin_select" ON public.banned_keywords
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "kw_admin_write" ON public.banned_keywords;
CREATE POLICY "kw_admin_write" ON public.banned_keywords
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- 4) keyword_logs
CREATE TABLE IF NOT EXISTS public.keyword_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT,
  matched_keyword TEXT NOT NULL,
  penalty INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_keyword_logs_created ON public.keyword_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_logs_user ON public.keyword_logs (user_id);

GRANT SELECT, INSERT ON public.keyword_logs TO authenticated;
GRANT ALL ON public.keyword_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.keyword_logs_id_seq TO authenticated;

ALTER TABLE public.keyword_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "klog_admin_select" ON public.keyword_logs;
CREATE POLICY "klog_admin_select" ON public.keyword_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "klog_self_insert" ON public.keyword_logs;
CREATE POLICY "klog_self_insert" ON public.keyword_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 5) RPCs
-- 5.1 Phê duyệt tố cáo: trừ uy tín (admin nhập) + XOÁ bài viết vi phạm.
CREATE OR REPLACE FUNCTION public.admin_resolve_report(_report_id UUID, _penalty INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID;
  v_post UUID;
  v_is_admin BOOLEAN;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT target_id, post_id INTO v_target, v_post
    FROM public.user_reports WHERE id = _report_id;
  IF v_target IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;

  -- Trừ uy tín người bị tố cáo (trigger sẽ tự khoá nếu rớt dưới 70).
  IF _penalty > 0 THEN
    UPDATE public.profiles
       SET reputation_score = GREATEST(0, COALESCE(reputation_score, 100) - _penalty)
     WHERE id = v_target;
  END IF;

  -- Xoá / ẩn bài viết vi phạm (nếu có).
  IF v_post IS NOT NULL THEN
    DELETE FROM public.posts WHERE id = v_post;
  END IF;

  UPDATE public.user_reports
     SET status = 'resolved',
         resolution = 'penalty_' || _penalty::text,
         penalty_applied = _penalty,
         resolved_by = auth.uid(),
         resolved_at = now()
   WHERE id = _report_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resolve_report(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, INT) TO authenticated;

-- 5.2 Từ chối tố cáo
CREATE OR REPLACE FUNCTION public.admin_ignore_report(_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_is_admin BOOLEAN;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.user_reports
     SET status = 'ignored', resolution = 'ignored',
         resolved_by = auth.uid(), resolved_at = now()
   WHERE id = _report_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_ignore_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ignore_report(UUID) TO authenticated;

-- 5.3 Mở khoá tài khoản: nâng điểm >= 70 (trigger tự gỡ is_banned).
CREATE OR REPLACE FUNCTION public.admin_unlock_user(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_is_admin BOOLEAN;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.profiles
     SET reputation_score = GREATEST(COALESCE(reputation_score, 0), 100),
         is_banned = false,
         account_status = 'active'
   WHERE id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_unlock_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unlock_user(UUID) TO authenticated;

-- 5.4 Bot từ cấm: trừ uy tín tác giả + ghi log (gọi khi caption khớp từ cấm).
CREATE OR REPLACE FUNCTION public.apply_keyword_penalty(
  _keyword TEXT, _penalty INT, _content TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.keyword_logs (user_id, content, matched_keyword, penalty)
  VALUES (v_uid, _content, _keyword, _penalty);

  IF _penalty > 0 THEN
    UPDATE public.profiles
       SET reputation_score = GREATEST(0, COALESCE(reputation_score, 100) - _penalty)
     WHERE id = v_uid;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_keyword_penalty(TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_keyword_penalty(TEXT, INT, TEXT) TO authenticated;

-- 5.5 Bot từ cấm BLACK-BOX (server-side):
-- Chuẩn hoá caption ngay trên server (bỏ dấu TV + bỏ ký tự đặc biệt + lowercase)
-- rồi đối chiếu danh sách ẩn. KHÔNG trả danh sách từ cấm về client.
-- Trả về TRUE nếu vi phạm (đã trừ 15 uy tín + ghi log). Caption "l.ồ.n" -> "lon"? KHÔNG:
-- bỏ dấu xong "lồn" -> "lon"; từ cấm cũng chuẩn hoá cùng cách nên vẫn khớp.
CREATE OR REPLACE FUNCTION public.scan_post_keywords(_content TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_norm  TEXT;
  v_match TEXT;
  v_pen   INT := 15;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  v_norm := regexp_replace(
    translate(
      lower(COALESCE(_content, '')),
      'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    ),
    '[^a-z0-9]', '', 'g'
  );
  IF v_norm = '' THEN RETURN false; END IF;

  SELECT keyword INTO v_match
    FROM public.banned_keywords
   WHERE normalized <> '' AND position(normalized IN v_norm) > 0
   ORDER BY penalty DESC
   LIMIT 1;

  IF v_match IS NULL THEN RETURN false; END IF;

  INSERT INTO public.keyword_logs (user_id, content, matched_keyword, penalty)
  VALUES (v_uid, _content, v_match, v_pen);

  UPDATE public.profiles
     SET reputation_score = GREATEST(0, COALESCE(reputation_score, 100) - v_pen)
   WHERE id = v_uid;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.scan_post_keywords(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_post_keywords(TEXT) TO authenticated;
