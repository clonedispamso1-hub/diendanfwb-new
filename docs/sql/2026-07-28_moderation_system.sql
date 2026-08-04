-- =====================================================================
-- HỆ THỐNG KIỂM DUYỆT NỘI DUNG V2 (Post / Comment / Message)
-- Chạy 1 lần trong SQL Editor (DB: zbuwddjcqdlyijcunwgd). Idempotent.
--   • Mở rộng keyword_logs -> log vi phạm đầy đủ (user, username, nội dung,
--     từ khoá, loại, thời gian, IP, thiết bị)
--   • RPC moderate_content(): quét từ cấm + luật bảo vệ trẻ vị thành niên
--   • RPC admin_moderation_stats(): thống kê cho Admin
-- =====================================================================

-- 1) LOG VI PHẠM ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.keyword_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  content TEXT,
  matched_keyword TEXT,
  penalty INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.keyword_logs
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS context_type TEXT NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'high',
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS device TEXT;

CREATE INDEX IF NOT EXISTS idx_keyword_logs_created ON public.keyword_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_logs_user ON public.keyword_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_keyword_logs_kw ON public.keyword_logs(matched_keyword);

GRANT SELECT ON public.keyword_logs TO authenticated;
GRANT ALL ON public.keyword_logs TO service_role;
ALTER TABLE public.keyword_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read keyword logs" ON public.keyword_logs;
CREATE POLICY "admins read keyword logs" ON public.keyword_logs
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- 2) TỪ CẤM: thêm phân loại --------------------------------------------
ALTER TABLE public.banned_keywords
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

-- Seed luật bảo vệ trẻ vị thành niên (idempotent).
INSERT INTO public.banned_keywords (keyword, normalized, severity, penalty, category)
SELECT v.k,
       regexp_replace(translate(lower(v.k),
         'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
         'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
         '[^a-z0-9]', '', 'g'),
       'critical', 100, 'minor'
FROM (VALUES
  ('trẻ em'), ('vị thành niên'), ('học sinh cấp 2'), ('học sinh cấp 1'),
  ('gái 2k9'), ('gái 2k10'), ('gái 2k11'), ('gái 2k12'),
  ('under age'), ('underage'), ('child porn'), ('loli'), ('lolita'), ('pedo')
) AS v(k)
WHERE NOT EXISTS (SELECT 1 FROM public.banned_keywords b WHERE lower(b.keyword) = lower(v.k));

-- 3) RPC KIỂM DUYỆT -----------------------------------------------------
-- Trả về jsonb: { blocked: bool, severity: text }
-- KHÔNG trả về từ khoá đã khớp (tránh lộ danh sách từ cấm cho client).
CREATE OR REPLACE FUNCTION public.moderate_content(
  _content TEXT,
  _kind TEXT DEFAULT 'post',
  _device TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_norm  TEXT;
  v_match TEXT;
  v_sev   TEXT := 'high';
  v_pen   INT  := 15;
  v_user  TEXT;
  v_ip    TEXT;
  v_minor BOOLEAN := false;
BEGIN
  IF v_uid IS NULL OR COALESCE(_content, '') = '' THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  v_norm := regexp_replace(
    translate(lower(_content),
      'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
    '[^a-z0-9]', '', 'g');
  IF v_norm = '' THEN RETURN jsonb_build_object('blocked', false); END IF;

  -- 3a) Luật bảo vệ trẻ vị thành niên (ưu tiên cao nhất).
  IF v_norm ~ '(1[0-7]tuoi|duoi18|chua18|hocsinhcap[12]|lop([6-9]|1[01])|trebe|childporn|underage|loli|pedo)'
  THEN
    v_minor := true; v_sev := 'critical'; v_pen := 100; v_match := 'minor_protection';
  ELSE
    SELECT b.keyword,
           COALESCE(b.severity, 'high'),
           GREATEST(COALESCE(b.penalty, 15), 1)
      INTO v_match, v_sev, v_pen
      FROM public.banned_keywords b
     WHERE b.normalized <> '' AND position(b.normalized IN v_norm) > 0
     ORDER BY b.penalty DESC
     LIMIT 1;
  END IF;

  IF v_match IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;

  SELECT p.username INTO v_user FROM public.profiles p WHERE p.id = v_uid;
  BEGIN
    v_ip := COALESCE(
      split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
      current_setting('request.headers', true)::json ->> 'cf-connecting-ip');
  EXCEPTION WHEN OTHERS THEN v_ip := NULL;
  END;

  INSERT INTO public.keyword_logs
    (user_id, username, content, matched_keyword, penalty, context_type, severity, ip_address, device)
  VALUES
    (v_uid, v_user, _content, v_match, v_pen,
     COALESCE(NULLIF(_kind, ''), 'post'), v_sev, v_ip, NULLIF(_device, ''));

  UPDATE public.profiles
     SET reputation_score = GREATEST(0, COALESCE(reputation_score, 100) - v_pen)
   WHERE id = v_uid;

  RETURN jsonb_build_object('blocked', true, 'severity', v_sev, 'minor', v_minor);
END;
$$;
REVOKE ALL ON FUNCTION public.moderate_content(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_content(TEXT, TEXT, TEXT) TO authenticated;

-- 4) THỐNG KÊ CHO ADMIN -------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_moderation_stats(_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
  v_out JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.keyword_logs WHERE created_at >= v_since),
    'total_all', (SELECT count(*) FROM public.keyword_logs),
    'critical', (SELECT count(*) FROM public.keyword_logs WHERE created_at >= v_since AND severity = 'critical'),
    'by_type', (
      SELECT COALESCE(jsonb_object_agg(context_type, c), '{}'::jsonb)
      FROM (SELECT context_type, count(*) c FROM public.keyword_logs
            WHERE created_at >= v_since GROUP BY 1) t),
    'top_keywords', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('keyword', matched_keyword, 'count', c) ORDER BY c DESC), '[]'::jsonb)
      FROM (SELECT matched_keyword, count(*) c FROM public.keyword_logs
            WHERE created_at >= v_since GROUP BY 1 ORDER BY 2 DESC LIMIT 10) k),
    'top_users', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'user_id', user_id, 'username', username, 'count', c) ORDER BY c DESC), '[]'::jsonb)
      FROM (SELECT user_id, max(username) username, count(*) c FROM public.keyword_logs
            WHERE created_at >= v_since GROUP BY user_id ORDER BY 3 DESC LIMIT 10) u)
  ) INTO v_out;

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_moderation_stats(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_moderation_stats(INT) TO authenticated;
