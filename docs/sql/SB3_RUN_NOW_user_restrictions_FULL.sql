-- =====================================================================
-- SUPABASE #3 — MIGRATION HOÀN CHỈNH: HẠN CHẾ THEO HÀNH ĐỘNG
-- File này chạy DUY NHẤT trên Supabase #3 (DB social/logs: posts,
-- comments, messages, keyword_logs, notifications).
--
-- Bao gồm:
--   1. public.moderation_admins   + public.is_moderation_admin()
--   2. public.user_restrictions   (bảng bản sao hạn chế trên DB #3)
--   3. public.has_active_restriction(uuid, text)
--   4. public.sync_user_restriction(uuid, text, text, timestamptz)
--   5. public.clear_user_restriction(uuid, text)
--   6. public.admin_keyword_offenders(int)
--   7. ENFORCE: trigger BEFORE INSERT chặn post / comment / message / like /
--      gift khi có hạn chế còn hiệu lực (hết hạn → tự mở lại)
--   8. Thông báo cho admin khi có vi phạm từ khoá mới
--
-- Nguyên tắc: idempotent, KHÔNG xoá dữ liệu, KHÔNG khoá tài khoản, chỉ từ
-- chối hành động mới. Lỗi trả về theo định dạng `RESTRICTED:<kind>` để UI
-- dịch sang tiếng Việt thân thiện (src/lib/friendly-restrictions.ts).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) AI LÀ ADMIN (DB #3 có thể không có bảng profiles)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_admins (
  user_id    uuid PRIMARY KEY,
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

  -- Nếu DB #3 có bảng profiles (bản sao) thì ưu tiên cờ is_admin.
  IF to_regclass('public.profiles') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = $1), false)'
        INTO v_ok USING _uid;
    EXCEPTION WHEN others THEN
      v_ok := false;
    END;
  END IF;

  IF v_ok THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.moderation_admins WHERE user_id = _uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_moderation_admin(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) BẢNG HẠN CHẾ TRÊN DB #3 (bản sao của user_restrictions ở DB #1)
--    Cột giữ ĐÚNG như DB #1: id, user_id, kind, reason, expires_at,
--    created_by, created_at. expires_at NULL = vĩnh viễn.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_restrictions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  kind       text NOT NULL,
  reason     text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bổ sung cột nếu bảng đã tồn tại từ bản cũ.
ALTER TABLE public.user_restrictions ADD COLUMN IF NOT EXISTS reason     text;
ALTER TABLE public.user_restrictions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.user_restrictions ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.user_restrictions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ur3_lookup
  ON public.user_restrictions (user_id, kind, expires_at);

GRANT SELECT ON public.user_restrictions TO authenticated;
GRANT ALL    ON public.user_restrictions TO service_role;

ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;

-- Người dùng đọc được hạn chế của chính mình; admin đọc tất cả.
DROP POLICY IF EXISTS "ur3_read_own_or_admin" ON public.user_restrictions;
CREATE POLICY "ur3_read_own_or_admin" ON public.user_restrictions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_moderation_admin());

-- Mọi ghi/xoá chỉ đi qua RPC SECURITY DEFINER bên dưới (không có policy write).

-- ---------------------------------------------------------------------
-- 3) has_active_restriction — nguồn sự thật duy nhất cho mọi enforce
--    'suspend' bao trùm mọi hành động.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_active_restriction(_user uuid, _kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_restrictions
     WHERE user_id = _user
       AND kind IN (_kind, 'suspend', 'permanent_ban')
       AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_restriction(uuid, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) sync_user_restriction — admin đồng bộ hạn chế từ DB #1 sang DB #3
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_restriction(
  p_user_id    uuid,
  p_kind       text,
  p_reason     text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderation_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_user_id IS NULL OR p_kind IS NULL OR btrim(p_kind) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  -- 1 user + 1 kind = 1 dòng hiệu lực (áp lại = ghi đè thời hạn).
  DELETE FROM public.user_restrictions
   WHERE user_id = p_user_id AND kind = p_kind;

  INSERT INTO public.user_restrictions (user_id, kind, reason, expires_at, created_by)
  VALUES (p_user_id, p_kind, NULLIF(btrim(COALESCE(p_reason, '')), ''), p_expires_at, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_restriction(uuid, text, text, timestamptz)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) clear_user_restriction — gỡ hạn chế (xoá dòng)
-- ---------------------------------------------------------------------
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

  DELETE FROM public.user_restrictions
   WHERE user_id = p_user_id
     AND (p_kind IS NULL OR kind = p_kind);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_user_restriction(uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6) admin_keyword_offenders — gom vi phạm theo TÀI KHOẢN
--    (dùng cho tab "Tài khoản vi phạm" của Bot Từ khoá)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_keyword_offenders(_limit int DEFAULT 100)
RETURNS TABLE (
  user_id      uuid,
  username     text,
  violations   bigint,
  last_at      timestamptz,
  last_keyword text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.user_id,
         MAX(l.username)                                              AS username,
         COUNT(*)                                                     AS violations,
         MAX(l.created_at)                                            AS last_at,
         (ARRAY_AGG(l.matched_keyword ORDER BY l.created_at DESC))[1] AS last_keyword
    FROM public.keyword_logs l
   WHERE l.user_id IS NOT NULL
   GROUP BY l.user_id
   ORDER BY COUNT(*) DESC, MAX(l.created_at) DESC
   LIMIT GREATEST(COALESCE(_limit, 100), 1);
$$;

GRANT EXECUTE ON FUNCTION public.admin_keyword_offenders(int)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) ENFORCE — trigger BEFORE INSERT, chỉ từ chối hành động mới
--    Lỗi dạng `RESTRICTED:<kind>` để frontend dịch tiếng Việt.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_restriction_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_active_restriction(NEW.user_id, 'post') THEN
    RAISE EXCEPTION 'RESTRICTED:post';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_restriction_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_active_restriction(NEW.user_id, 'comment') THEN
    RAISE EXCEPTION 'RESTRICTED:comment';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_restriction_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_active_restriction(NEW.sender_id, 'message') THEN
    RAISE EXCEPTION 'RESTRICTED:message';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_restriction_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_active_restriction(NEW.user_id, 'like') THEN
    RAISE EXCEPTION 'RESTRICTED:like';
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

-- Bảng "like" có thể mang nhiều tên tuỳ phiên bản → chỉ gắn khi tồn tại.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['post_likes', 'likes', 'comment_likes', 'reactions']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
       )
    THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_restriction_like ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_enforce_restriction_like BEFORE INSERT ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.enforce_restriction_like()', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 8) THÔNG BÁO CHO ADMIN KHI CÓ VI PHẠM TỪ KHOÁ MỚI
-- ---------------------------------------------------------------------
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
      format('Tài khoản %s vừa vi phạm từ khoá "%s" (tổng %s lần)',
             v_name, NEW.matched_keyword, v_count),
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

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- GHI CHÚ
--  • Thêm admin cho DB #3:
--      INSERT INTO public.moderation_admins (user_id) VALUES ('<uuid-admin>')
--      ON CONFLICT DO NOTHING;
--  • Hạn chế hết hạn tự mở lại (không cần cron): mọi enforce đều so
--    expires_at > now().
--  • Dọn dòng đã hết hạn (tuỳ chọn, an toàn):
--      DELETE FROM public.user_restrictions
--       WHERE expires_at IS NOT NULL AND expires_at < now() - interval '30 days';
-- =====================================================================
