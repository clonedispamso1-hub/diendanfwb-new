-- =====================================================================
-- FIX: null value in column "normalized" of relation "banned_keywords"
-- CHẠY TRÊN SUPABASE #1 (DB chứa bảng banned_keywords). Idempotent.
--   • keyword: giữ NGUYÊN VĂN Admin nhập
--   • normalized: LUÔN được sinh tự động (trigger) = normalizeText(keyword)
--   • Không bao giờ cho phép normalized = NULL
-- =====================================================================

-- 1) Hàm chuẩn hoá — khớp 100% với normalizeText() ở client -------------
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

-- 2) Trigger: luôn gán normalized khi INSERT/UPDATE ---------------------
CREATE OR REPLACE FUNCTION public.banned_keywords_set_normalized()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.normalized := public.kw_normalize(COALESCE(NULLIF(NEW.normalized, ''), NEW.keyword));
  IF NEW.normalized IS NULL OR NEW.normalized = '' THEN
    RAISE EXCEPTION 'Từ khoá không hợp lệ sau khi chuẩn hoá: %', NEW.keyword;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_banned_keywords_normalized ON public.banned_keywords;
CREATE TRIGGER trg_banned_keywords_normalized
BEFORE INSERT OR UPDATE OF keyword, normalized ON public.banned_keywords
FOR EACH ROW EXECUTE FUNCTION public.banned_keywords_set_normalized();

-- 3) Backfill các dòng cũ bị NULL/rỗng ---------------------------------
UPDATE public.banned_keywords
   SET normalized = public.kw_normalize(keyword)
 WHERE normalized IS NULL OR normalized = '';

DELETE FROM public.banned_keywords
 WHERE normalized IS NULL OR normalized = '';

ALTER TABLE public.banned_keywords ALTER COLUMN normalized SET NOT NULL;

-- 4) RPC thêm từ khoá: keyword nguyên văn + normalized đầy đủ ----------
CREATE OR REPLACE FUNCTION public.admin_add_keyword(
  _keyword TEXT,
  _severity TEXT DEFAULT 'medium',
  _penalty INT DEFAULT 5
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   BIGINT;
  v_kw   TEXT := btrim(COALESCE(_keyword, ''));
  v_norm TEXT;
BEGIN
  PERFORM public._admin_guard();

  IF v_kw = '' THEN
    RAISE EXCEPTION 'Từ khoá trống';
  END IF;

  v_norm := public.kw_normalize(v_kw);
  IF v_norm = '' THEN
    RAISE EXCEPTION 'Từ khoá không hợp lệ sau khi chuẩn hoá';
  END IF;

  INSERT INTO public.banned_keywords (keyword, normalized, severity, penalty, created_by)
  VALUES (v_kw, v_norm, COALESCE(NULLIF(_severity, ''), 'medium'),
          GREATEST(COALESCE(_penalty, 5), 0), auth.uid())
  ON CONFLICT (keyword) DO UPDATE
     SET normalized = EXCLUDED.normalized,
         severity   = EXCLUDED.severity,
         penalty    = EXCLUDED.penalty
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_keyword(TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_keyword(TEXT, TEXT, INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
