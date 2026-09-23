-- =====================================================================
-- RUN ON SUPABASE #1 (core — gxfxqbhxoghdhokwjpex)
-- Cài moderate_content(text, text, text) + scan_post_keywords(text)
-- đúng như src/lib/keyword-filter.ts gọi:
--   rpc('moderate_content', { _content, _kind, _device })  → jsonb { blocked }
--   rpc('scan_post_keywords', { _content })                → boolean
-- Nguồn: docs/sql/2026-07-29_hotfix_keyword_data_ops.sql (mục 1, 2, 3, 5),
-- docs/sql/2026-06-14_reports_keyword_system.sql (mục 5.5 — scan_post_keywords),
-- supabase-sql/SB1/2026-08-25-content-moderation-gate.sql (kw_normalize /
-- is_content_blocked — đã có sẵn trên #1, không tạo lại).
-- CHỈ phần cần cho kiểm duyệt — không cài admin_factory_reset,
-- export/import hay các RPC khác trong file gốc.
--
-- An toàn production: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS,
-- KHÔNG DROP TABLE, KHÔNG xoá dữ liệu. Idempotent.
--
-- Dependency (đều trên #1): profiles(id, username, is_admin, reputation_score),
-- banned_keywords(keyword, normalized, severity, penalty), keyword_logs.
-- =====================================================================

-- 0) Kiểm tra dependency bắt buộc: dừng nếu thiếu (không tự tạo profiles).
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Thiếu bảng public.profiles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='profiles' AND column_name='reputation_score') THEN
    RAISE EXCEPTION 'Thiếu cột profiles.reputation_score — kiểm tra trước khi chạy';
  END IF;
END $$;

-- 1) keyword_logs ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.keyword_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  matched_keyword TEXT NOT NULL,
  penalty INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.keyword_logs
  ADD COLUMN IF NOT EXISTS content      TEXT,
  ADD COLUMN IF NOT EXISTS context_type TEXT,
  ADD COLUMN IF NOT EXISTS severity     TEXT,
  ADD COLUMN IF NOT EXISTS username     TEXT,
  ADD COLUMN IF NOT EXISTS ip_address   TEXT,
  ADD COLUMN IF NOT EXISTS device       TEXT;

GRANT SELECT, INSERT ON public.keyword_logs TO authenticated;
GRANT ALL ON public.keyword_logs TO service_role;
ALTER TABLE public.keyword_logs ENABLE ROW LEVEL SECURITY;

-- Chỉ tạo policy nếu bảng chưa có policy nào (không ghi đè RLS hiện có).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='keyword_logs') THEN
    EXECUTE $p$CREATE POLICY "klog_admin_select" ON public.keyword_logs FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))$p$;
    EXECUTE $p$CREATE POLICY "klog_self_insert" ON public.keyword_logs FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid())$p$;
  END IF;
END $$;

-- 2) banned_keywords (giữ nguyên nếu đã có) -------------------------
CREATE TABLE IF NOT EXISTS public.banned_keywords (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  normalized TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  penalty INT NOT NULL DEFAULT 15,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.banned_keywords
  ADD COLUMN IF NOT EXISTS normalized TEXT,
  ADD COLUMN IF NOT EXISTS severity   TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS penalty    INT  DEFAULT 15;

-- 3) Chuẩn hoá text (bỏ dấu TV + lowercase + strip) ----------------
CREATE OR REPLACE FUNCTION public._norm_text(_s TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    translate(
      lower(COALESCE(_s, '')),
      'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    ),
    '[^a-z0-9]', '', 'g'
  );
$$;

-- 3b) kw_normalize: hàm chuẩn hoá đã dùng bởi is_content_blocked
--     (supabase-sql/SB1/2026-08-25-content-moderation-gate.sql).
--     CHỈ tạo khi thiếu — không ghi đè bản đang chạy trên #1.
DO $do$
BEGIN
  IF to_regprocedure('public.kw_normalize(text)') IS NULL THEN
    EXECUTE $f$CREATE FUNCTION public.kw_normalize(_s TEXT) RETURNS TEXT
               LANGUAGE sql IMMUTABLE AS 'SELECT public._norm_text($1)'$f$;
  END IF;
END $do$;

-- Điền normalized cho từ khoá cũ còn trống (chỉ UPDATE cột rỗng, không xoá).
UPDATE public.banned_keywords
   SET normalized = public._norm_text(keyword)
 WHERE normalized IS NULL OR normalized = '';

-- 4) moderate_content ------------------------------------------------
-- Khớp từ khoá theo ĐÚNG luật của is_content_blocked hiện có:
-- dùng normalized (fallback kw_normalize(keyword)) và bỏ từ ngắn < 3 ký tự.
CREATE OR REPLACE FUNCTION public.moderate_content(
  _content TEXT, _kind TEXT DEFAULT 'post', _device TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid(); v_norm TEXT; v_match TEXT; v_pen INT; v_sev TEXT; v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;
  v_norm := public._norm_text(_content);
  IF v_norm = '' THEN RETURN jsonb_build_object('blocked', false); END IF;

  SELECT b.keyword, b.penalty, b.severity INTO v_match, v_pen, v_sev
    FROM public.banned_keywords b
   WHERE length(COALESCE(NULLIF(b.normalized, ''), public._norm_text(b.keyword))) >= 3
     AND position(COALESCE(NULLIF(b.normalized, ''), public._norm_text(b.keyword)) IN v_norm) > 0
   ORDER BY b.penalty DESC NULLS LAST LIMIT 1;

  IF v_match IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;

  SELECT username INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.keyword_logs
    (user_id, username, content, matched_keyword, penalty, context_type, severity, device)
  VALUES
    (v_uid, v_name, _content, v_match, COALESCE(v_pen,15),
     COALESCE(_kind,'post'), COALESCE(v_sev,'medium'), _device);

  UPDATE public.profiles
     SET reputation_score = GREATEST(0, COALESCE(reputation_score,100) - COALESCE(v_pen,15))
   WHERE id = v_uid;

  RETURN jsonb_build_object('blocked', true, 'severity', COALESCE(v_sev,'medium'));
END $$;

REVOKE ALL ON FUNCTION public.moderate_content(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_content(TEXT, TEXT, TEXT) TO authenticated;

-- 4b) scan_post_keywords(text) -> boolean ----------------------------
-- RPC cũ vẫn được gọi trong src/lib/keyword-filter.ts (bước 2) và
-- src/components/candy/feed-page.tsx. Nguồn gốc:
-- docs/sql/2026-06-14_reports_keyword_system.sql (mục 5.5).
-- Cài lại dưới dạng wrapper của moderate_content để CHỈ có MỘT nơi
-- ghi keyword_logs + trừ reputation_score (không nhân đôi hình phạt).
CREATE OR REPLACE FUNCTION public.scan_post_keywords(_content TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE(
    (public.moderate_content(_content, 'post', NULL) ->> 'blocked')::boolean,
    false
  );
END $$;

REVOKE ALL ON FUNCTION public.scan_post_keywords(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_post_keywords(TEXT) TO authenticated;

-- 4c) is_content_blocked(text): đã CÓ trên #1 (kiểm tra ở Supabase #1 = CÓ).
--     KHÔNG tạo lại để không thay đổi hành vi hiện tại.

NOTIFY pgrst, 'reload schema';

-- 5) Kiểm tra sau khi chạy (chỉ đọc):
-- SELECT to_regprocedure('public.moderate_content(text,text,text)'),
--        to_regprocedure('public.is_content_blocked(text)'),
--        to_regprocedure('public.scan_post_keywords(text)'),
--        to_regprocedure('public.kw_normalize(text)');
