-- =====================================================================
-- BỘ LỌC TỪ KHOÁ — VI PHẠM + HẠN CHẾ THEO HÀNH ĐỘNG (ENFORCE Ở DB)
-- Idempotent. Chạy trong SQL Editor.
--
--   PHẦN A — chạy trên SUPABASE #3 (DB chứa posts / comments / messages /
--            keyword_logs / notifications).
--   PHẦN B — chạy trên SUPABASE #1 (DB chứa profiles / user_restrictions)
--            chỉ để chắc chắn hàm has_active_restriction tồn tại.
--
-- Nguyên tắc:
--   • KHÔNG khoá tài khoản, KHÔNG xoá bài / bình luận / tin nhắn.
--   • Chỉ chặn hành động khi có hạn chế còn hiệu lực (hết hạn tự mở lại).
--   • Giữ toàn bộ lịch sử vi phạm trong keyword_logs.
-- =====================================================================


-- =====================================================================
-- PHẦN A — SUPABASE #3
-- =====================================================================

-- A1) Ai là admin (DB #3 có thể không có bảng profiles) -----------------
CREATE TABLE IF NOT EXISTS public.moderation_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.moderation_admins TO authenticated;
GRANT ALL    ON public.moderation_admins TO service_role;
ALTER TABLE public.moderation_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mod_admins_read" ON public.moderation_admins;
CREATE POLICY "mod_admins_read" ON public.moderation_admins
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.is_moderation_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok boolean := false;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = $1), false)'
        INTO v_ok USING _uid;
    EXCEPTION WHEN others THEN v_ok := false;
    END;
  END IF;
  IF v_ok THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.moderation_admins WHERE user_id = _uid);
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_moderation_admin(uuid) TO authenticated, service_role;

-- A2) Bản sao hạn chế trên DB #3 để trigger chặn được ------------------
CREATE TABLE IF NOT EXISTS public.user_restrictions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  kind       text NOT NULL,
  reason     text,
  expires_at timestamptz,             -- NULL = vĩnh viễn
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ur3_lookup ON public.user_restrictions (user_id, kind, expires_at);
GRANT SELECT ON public.user_restrictions TO authenticated;
GRANT ALL    ON public.user_restrictions TO service_role;
ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ur3_read_own_or_admin" ON public.user_restrictions;
CREATE POLICY "ur3_read_own_or_admin" ON public.user_restrictions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_moderation_admin());

CREATE OR REPLACE FUNCTION public.has_active_restriction(_user uuid, _kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_restrictions
     WHERE user_id = _user
       AND kind IN (_kind, 'suspend')
       AND (expires_at IS NULL OR expires_at > now())
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_active_restriction(uuid, text) TO anon, authenticated, service_role;

-- Admin đồng bộ hạn chế từ DB #1 sang DB #3 (được gọi từ app).
CREATE OR REPLACE FUNCTION public.sync_user_restriction(
  p_user_id uuid, p_kind text, p_reason text, p_expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderation_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  DELETE FROM public.user_restrictions WHERE user_id = p_user_id AND kind = p_kind;
  INSERT INTO public.user_restrictions (user_id, kind, reason, expires_at, created_by)
  VALUES (p_user_id, p_kind, p_reason, p_expires_at, auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.sync_user_restriction(uuid, text, text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clear_user_restriction(p_user_id uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderation_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  DELETE FROM public.user_restrictions WHERE user_id = p_user_id AND kind = p_kind;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clear_user_restriction(uuid, text) TO authenticated, service_role;

-- A3) Trigger chặn hành động (KHÔNG xoá dữ liệu, chỉ từ chối ghi mới) ---
CREATE OR REPLACE FUNCTION public.enforce_restriction_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_active_restriction(NEW.user_id, 'post') THEN
    RAISE EXCEPTION 'RESTRICTED_POST: Bạn đang bị hạn chế đăng bài.';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_restriction_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_active_restriction(NEW.user_id, 'comment') THEN
    RAISE EXCEPTION 'RESTRICTED_COMMENT: Bạn đang bị hạn chế bình luận.';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_restriction_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_active_restriction(NEW.sender_id, 'message') THEN
    RAISE EXCEPTION 'RESTRICTED_MESSAGE: Bạn đang bị hạn chế nhắn tin.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_restriction_post ON public.posts;
CREATE TRIGGER trg_enforce_restriction_post
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_restriction_post();

DROP TRIGGER IF EXISTS trg_enforce_restriction_comment ON public.comments;
CREATE TRIGGER trg_enforce_restriction_comment
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_restriction_comment();

DROP TRIGGER IF EXISTS trg_enforce_restriction_message ON public.messages;
CREATE TRIGGER trg_enforce_restriction_message
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_restriction_message();

-- A4) Thông báo cho Admin khi có vi phạm từ khoá mới -------------------
CREATE OR REPLACE FUNCTION public.notify_admins_keyword_violation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name  text := COALESCE(NEW.username, left(NEW.user_id::text, 8));
  v_count int;
  a       record;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.keyword_logs WHERE user_id = NEW.user_id;

  FOR a IN SELECT user_id FROM public.moderation_admins LOOP
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
    VALUES (
      a.user_id, 'keyword_violation', 'Vi phạm từ khoá',
      format('Tài khoản %s vừa vi phạm từ khoá "%s" (tổng %s lần)', v_name, NEW.matched_keyword, v_count),
      jsonb_build_object('user_id', NEW.user_id, 'keyword', NEW.matched_keyword, 'count', v_count),
      false
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW; -- không bao giờ làm hỏng luồng ghi log
END; $$;

DROP TRIGGER IF EXISTS trg_notify_admins_keyword_violation ON public.keyword_logs;
CREATE TRIGGER trg_notify_admins_keyword_violation
  AFTER INSERT ON public.keyword_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_keyword_violation();

-- A5) Thống kê gom theo user cho màn "Tài khoản vi phạm" ---------------
CREATE OR REPLACE FUNCTION public.admin_keyword_offenders(_limit int DEFAULT 100)
RETURNS TABLE (user_id uuid, username text, violations bigint, last_at timestamptz, last_keyword text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.user_id,
         MAX(l.username)  AS username,
         COUNT(*)         AS violations,
         MAX(l.created_at) AS last_at,
         (ARRAY_AGG(l.matched_keyword ORDER BY l.created_at DESC))[1] AS last_keyword
    FROM public.keyword_logs l
   GROUP BY l.user_id
   ORDER BY COUNT(*) DESC
   LIMIT COALESCE(_limit, 100);
$$;
GRANT EXECUTE ON FUNCTION public.admin_keyword_offenders(int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- PHẦN B — SUPABASE #1 (nguồn chính của user_restrictions)
-- Xem docs/sql/RUN_NOW_user_restrictions.sql (đã có sẵn) — chạy file đó
-- nếu bảng user_restrictions / has_active_restriction chưa tồn tại.
-- =====================================================================
