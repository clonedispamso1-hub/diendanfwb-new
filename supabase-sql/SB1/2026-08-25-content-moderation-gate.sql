-- =====================================================================
-- MODERATION GATE CHUNG (post / comment / message / display_name / bio)
-- CHẠY TRÊN SUPABASE #1 (DB chứa bảng banned_keywords). Idempotent.
--   • Chỉ KIỂM TRA, không ghi log, không khoá/xoá tài khoản.
--   • Dùng đúng public.kw_normalize() (khớp normalizeText() ở client),
--     nên né kiểu "c o n c ặ c", "c.o.n...cặc", CHỮ HOA, zero-width đều dính.
--   • User thường KHÔNG đọc được banned_keywords (RLS) → dùng SECURITY DEFINER.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.kw_normalize(_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
           translate(
             lower(COALESCE(_text, '')),
             'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
             'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
           '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.is_content_blocked(_content TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm TEXT := public.kw_normalize(_content);
BEGIN
  IF v_norm IS NULL OR length(v_norm) = 0 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.banned_keywords b
     WHERE COALESCE(NULLIF(b.normalized, ''), public.kw_normalize(b.keyword)) IS NOT NULL
       AND length(COALESCE(NULLIF(b.normalized, ''), public.kw_normalize(b.keyword))) >= 3
       AND position(COALESCE(NULLIF(b.normalized, ''), public.kw_normalize(b.keyword)) IN v_norm) > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_content_blocked(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_content_blocked(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
