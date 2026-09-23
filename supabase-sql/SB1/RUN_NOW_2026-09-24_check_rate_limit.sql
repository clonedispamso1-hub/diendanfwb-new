-- =====================================================================
-- RUN ON SUPABASE #1 (core — gxfxqbhxoghdhokwjpex)
-- Cài check_rate_limit(_action text, _max_hits int, _window_seconds int)
-- đúng signature mà src/lib/rate-limit.ts gọi: rpc('check_rate_limit', {_action}).
-- Nguồn: docs/sql/2026-07-19_global_rate_limiting.sql (giữ nguyên logic).
--
-- An toàn production: CREATE ... IF NOT EXISTS, KHÔNG DROP TABLE,
-- KHÔNG xoá dữ liệu rate_limit_hits hiện có. Idempotent.
-- =====================================================================

-- 1) Gỡ bản stub không tham số (chỉ RETURN TRUE). Chỉ xoá FUNCTION, không đụng dữ liệu.
--    Cần gỡ để PostgREST không nhầm overload.
DROP FUNCTION IF EXISTS public.check_rate_limit();
-- Gỡ luôn các overload 1–2 tham số (nếu có) để rpc('check_rate_limit', {_action})
-- không bị PostgREST báo ambiguous. Chỉ giữ bản (text, int, int).
DROP FUNCTION IF EXISTS public.check_rate_limit(text);
DROP FUNCTION IF EXISTS public.check_rate_limit(text, int);

-- 2) Bảng lưu lượt thao tác
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id      bigserial primary key,
  user_id uuid not null,
  action  text not null,
  hit_at  timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_user_action_time_idx
  ON public.rate_limit_hits (user_id, action, hit_at desc);

GRANT SELECT, INSERT, DELETE ON public.rate_limit_hits TO authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;
-- Sequence có thể mang tên khác nếu bảng đã tồn tại từ trước → cấp quyền động.
DO $do$
DECLARE s TEXT := pg_get_serial_sequence('public.rate_limit_hits', 'id');
BEGIN
  IF s IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', s);
    EXECUTE format('GRANT ALL ON SEQUENCE %s TO service_role', s);
  END IF;
END $do$;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_limit_hits_self_select ON public.rate_limit_hits;
CREATE POLICY rate_limit_hits_self_select ON public.rate_limit_hits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS rate_limit_hits_self_insert ON public.rate_limit_hits;
CREATE POLICY rate_limit_hits_self_insert ON public.rate_limit_hits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 3) Giới hạn mặc định theo action (max_hits, window_seconds)
CREATE OR REPLACE FUNCTION public.rate_limit_defaults(_action text)
RETURNS TABLE(max_hits int, window_seconds int)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE lower(_action)
      WHEN 'chat' THEN 5 WHEN 'bet' THEN 3 WHEN 'like' THEN 5 WHEN 'reaction' THEN 5
      WHEN 'follow' THEN 10 WHEN 'post' THEN 3 WHEN 'comment' THEN 3
      WHEN 'friend_request' THEN 5 WHEN 'notification' THEN 10 ELSE 5
    END,
    CASE lower(_action)
      WHEN 'chat' THEN 5 WHEN 'bet' THEN 5 WHEN 'like' THEN 5 WHEN 'reaction' THEN 5
      WHEN 'follow' THEN 60 WHEN 'post' THEN 30 WHEN 'comment' THEN 30
      WHEN 'friend_request' THEN 60 WHEN 'notification' THEN 30 ELSE 10
    END;
$$;

-- 4) Hàm chính
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _action text, _max_hits int DEFAULT NULL, _window_seconds int DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_max int; v_window int; v_count int;
BEGIN
  IF v_user IS NULL THEN RETURN true; END IF;

  SELECT coalesce(_max_hits, d.max_hits), coalesce(_window_seconds, d.window_seconds)
    INTO v_max, v_window FROM public.rate_limit_defaults(_action) d;

  SELECT count(*) INTO v_count FROM public.rate_limit_hits
   WHERE user_id = v_user AND action = _action
     AND hit_at > now() - make_interval(secs => v_window);

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Bạn đang thao tác quá nhanh. Vui lòng đợi 5–10 giây rồi thử lại.'
      USING errcode = 'P0001';
  END IF;

  INSERT INTO public.rate_limit_hits(user_id, action) VALUES (v_user, _action);

  -- Dọn lượt cũ của chính user (giữ bảng nhỏ) — như bản chuẩn.
  DELETE FROM public.rate_limit_hits
   WHERE user_id = v_user AND action = _action
     AND hit_at < now() - make_interval(secs => greatest(v_window * 4, 300));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_defaults(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
