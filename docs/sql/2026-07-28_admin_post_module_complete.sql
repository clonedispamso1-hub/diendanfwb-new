-- =====================================================================
-- ADMIN POST MODULE — COMPLETE MIGRATION (idempotent, safe to re-run)
-- File: 2026-07-28_admin_post_module_complete.sql
--
-- Bao gồm:
--   1) Admin detector `public.is_current_user_admin()` (đọc profiles.is_admin
--      HOẶC bảng user_roles) — dùng chung cho tất cả policy/RPC.
--   2) banned_keywords: bảng + RLS + RPC admin_* (fix lỗi
--      "new row violates row-level security policy for banned_keywords").
--   3) keyword_logs: log vi phạm Post/Comment/Message (lưu nội dung gốc,
--      user, username, IP, device, severity, matched_keyword, penalty).
--   4) moderate_content RPC (black-box) — chuẩn hoá, đối chiếu, ghi log,
--      trừ điểm uy tín; trả về {blocked, reason} — không lộ danh sách từ.
--   5) admin_moderation_stats RPC — thống kê 30 ngày cho dashboard.
--   6) admin_user_violations RPC — thống kê vi phạm theo user.
--   7) admin_pin_post đúng logic (pinned_until, tự hết hạn), thêm cột
--      is_pinned / pinned_until / pinned_at / pinned_by nếu thiếu.
--   8) admin_delete_all_posts RPC — xoá toàn bộ bài viết (có xác nhận).
--   9) admin_ban_user / admin_unban_user / admin_delete_user_permanent
--      + user_restrictions (post/comment/message).
--  10) blacklist_entries (phone / fingerprint / ip) khi xoá vĩnh viễn.
--  11) Sửa policy để Admin không còn Forbidden trên các bảng liên quan.
-- =====================================================================

BEGIN;

-- ============ 1) ADMIN DETECTOR ============
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- ============ 2) BANNED_KEYWORDS ============
CREATE TABLE IF NOT EXISTS public.banned_keywords (
  id          bigserial PRIMARY KEY,
  keyword     text NOT NULL,
  normalized  text NOT NULL,
  severity    text NOT NULL DEFAULT 'medium',
  penalty     integer NOT NULL DEFAULT 5,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (normalized)
);
CREATE INDEX IF NOT EXISTS banned_keywords_norm_idx ON public.banned_keywords(normalized);

ALTER TABLE public.banned_keywords ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.banned_keywords TO authenticated;
GRANT ALL    ON public.banned_keywords TO service_role;

-- Xoá mọi policy cũ để tránh xung đột / lỗi RLS khi INSERT
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='banned_keywords'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.banned_keywords', p.policyname);
  END LOOP;
END$$;

-- User thường: chỉ SELECT (client vẫn dùng để check nhanh nếu muốn)
CREATE POLICY "banned_keywords read all authenticated"
  ON public.banned_keywords FOR SELECT TO authenticated USING (true);

-- Admin có toàn quyền qua policy chuẩn (không cần RPC vẫn chạy nếu client
-- gọi trực tiếp — nhưng khuyến khích RPC dưới đây).
CREATE POLICY "banned_keywords admin all"
  ON public.banned_keywords FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- Helper chuẩn hoá phía SQL (khớp với normalizeText JS)
CREATE OR REPLACE FUNCTION public.norm_keyword(_s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           translate(
             lower(coalesce(_s,'')),
             'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
             'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
           ),
           '[^a-z0-9]', '', 'g'
         );
$$;

-- RPC admin — dùng SECURITY DEFINER để tránh mọi va chạm RLS
CREATE OR REPLACE FUNCTION public.admin_add_keyword(
  _keyword text, _severity text DEFAULT 'medium', _penalty integer DEFAULT 5
) RETURNS public.banned_keywords
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.banned_keywords;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.banned_keywords(keyword, normalized, severity, penalty, created_by)
  VALUES (_keyword, public.norm_keyword(_keyword),
          COALESCE(_severity,'medium'), COALESCE(_penalty,5), auth.uid())
  ON CONFLICT (normalized) DO UPDATE
    SET keyword = EXCLUDED.keyword,
        severity = EXCLUDED.severity,
        penalty  = EXCLUDED.penalty
  RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_add_keyword(text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_keyword(
  _id bigint, _penalty integer DEFAULT NULL, _severity text DEFAULT NULL
) RETURNS public.banned_keywords
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.banned_keywords;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.banned_keywords
     SET penalty  = COALESCE(_penalty,  penalty),
         severity = COALESCE(_severity, severity)
   WHERE id = _id
   RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_update_keyword(bigint,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_keyword(_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.banned_keywords WHERE id = _id;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_keyword(bigint) TO authenticated;

-- ============ 3) KEYWORD_LOGS ============
CREATE TABLE IF NOT EXISTS public.keyword_logs (
  id              bigserial PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  username        text,
  content         text NOT NULL,
  matched_keyword text,
  penalty         integer NOT NULL DEFAULT 0,
  severity        text,
  context_type    text NOT NULL DEFAULT 'post', -- post|comment|message
  ip_address      inet,
  device          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS keyword_logs_user_idx    ON public.keyword_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS keyword_logs_ctx_idx     ON public.keyword_logs(context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS keyword_logs_created_idx ON public.keyword_logs(created_at DESC);

ALTER TABLE public.keyword_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.keyword_logs TO authenticated;
GRANT ALL    ON public.keyword_logs TO service_role;

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='keyword_logs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.keyword_logs', p.policyname);
  END LOOP;
END$$;

CREATE POLICY "keyword_logs admin read"
  ON public.keyword_logs FOR SELECT TO authenticated
  USING (public.is_current_user_admin() OR user_id = auth.uid());

-- ============ 4) MODERATION RPC ============
CREATE OR REPLACE FUNCTION public.moderate_content(
  _content text, _kind text DEFAULT 'post', _device text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  norm       text;
  hit        public.banned_keywords;
  uname      text;
  ip_addr    inet;
BEGIN
  IF _content IS NULL OR btrim(_content) = '' THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;
  norm := public.norm_keyword(_content);
  IF norm = '' THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  SELECT * INTO hit FROM public.banned_keywords
   WHERE normalized <> '' AND position(normalized IN norm) > 0
   ORDER BY penalty DESC
   LIMIT 1;

  IF hit.id IS NULL THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  SELECT username INTO uname FROM public.profiles WHERE id = auth.uid();
  BEGIN
    ip_addr := inet_client_addr();
  EXCEPTION WHEN OTHERS THEN ip_addr := NULL;
  END;

  INSERT INTO public.keyword_logs(
    user_id, username, content, matched_keyword, penalty, severity,
    context_type, ip_address, device
  ) VALUES (
    auth.uid(), uname, _content, hit.keyword, hit.penalty, hit.severity,
    COALESCE(_kind,'post'), ip_addr, _device
  );

  -- Trừ điểm uy tín nếu cột tồn tại
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='profiles'
               AND column_name='reputation_score') THEN
    UPDATE public.profiles
       SET reputation_score = GREATEST(0, COALESCE(reputation_score,100) - hit.penalty)
     WHERE id = auth.uid();
  END IF;

  RETURN jsonb_build_object(
    'blocked', true,
    'reason',  'keyword',
    'severity', hit.severity
  );
END$$;
GRANT EXECUTE ON FUNCTION public.moderate_content(text,text,text) TO authenticated;

-- ============ 5) MODERATION STATS ============
CREATE OR REPLACE FUNCTION public.admin_moderation_stats(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  since timestamptz := now() - make_interval(days => COALESCE(_days,30));
  result jsonb;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'total',     (SELECT count(*) FROM public.keyword_logs WHERE created_at >= since),
    'total_all', (SELECT count(*) FROM public.keyword_logs),
    'critical',  (SELECT count(*) FROM public.keyword_logs
                   WHERE created_at >= since AND severity IN ('high','critical')),
    'by_type',   (SELECT jsonb_object_agg(context_type, c) FROM (
                    SELECT context_type, count(*) c FROM public.keyword_logs
                     WHERE created_at >= since GROUP BY context_type
                  ) x),
    'top_keywords', (SELECT COALESCE(jsonb_agg(jsonb_build_object('keyword',keyword,'count',c)), '[]'::jsonb) FROM (
                    SELECT matched_keyword AS keyword, count(*) c FROM public.keyword_logs
                     WHERE created_at >= since AND matched_keyword IS NOT NULL
                     GROUP BY matched_keyword ORDER BY c DESC LIMIT 10
                  ) x),
    'top_users', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'user_id', user_id, 'username', username, 'count', c)), '[]'::jsonb) FROM (
                    SELECT user_id, max(username) username, count(*) c FROM public.keyword_logs
                     WHERE created_at >= since AND user_id IS NOT NULL
                     GROUP BY user_id ORDER BY c DESC LIMIT 10
                  ) x)
  ) INTO result;

  RETURN result;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_moderation_stats(integer) TO authenticated;

-- ============ 6) VIOLATIONS BY USER ============
CREATE OR REPLACE FUNCTION public.admin_user_violations(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'total',   (SELECT count(*) FROM public.keyword_logs WHERE user_id = _user_id),
    'by_type', (SELECT jsonb_object_agg(context_type, c) FROM (
                  SELECT context_type, count(*) c FROM public.keyword_logs
                   WHERE user_id = _user_id GROUP BY context_type) x),
    'recent',  (SELECT COALESCE(jsonb_agg(row_to_json(k)), '[]'::jsonb) FROM (
                  SELECT id, content, matched_keyword, penalty, severity,
                         context_type, ip_address, device, created_at
                    FROM public.keyword_logs
                   WHERE user_id = _user_id
                   ORDER BY created_at DESC LIMIT 50) k)
  );
END$$;
GRANT EXECUTE ON FUNCTION public.admin_user_violations(uuid) TO authenticated;

-- ============ 7) POST PINNING ============
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_until      timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at         timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comments_disabled boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden         boolean     NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS posts_feed_order_idx
  ON public.posts (is_pinned DESC, pinned_at DESC NULLS LAST, created_at DESC);

-- Ghim đúng chuẩn: KHÔNG sửa created_at. _hours = 0 → gỡ ghim.
CREATE OR REPLACE FUNCTION public.admin_pin_post(p_post_id uuid, p_hours integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;

  IF COALESCE(p_hours,0) <= 0 THEN
    UPDATE public.posts
       SET is_pinned    = false,
           pinned_until = NULL,
           pinned_at    = NULL,
           pinned_by    = NULL
     WHERE id = p_post_id;
  ELSE
    UPDATE public.posts
       SET is_pinned    = true,
           pinned_at    = now(),
           pinned_until = now() + make_interval(hours => p_hours),
           pinned_by    = auth.uid()
     WHERE id = p_post_id;
  END IF;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_pin_post(uuid,integer) TO authenticated;

-- Job dọn ghim hết hạn — client gọi định kỳ hoặc pg_cron
CREATE OR REPLACE FUNCTION public.expire_pinned_posts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.posts
     SET is_pinned = false, pinned_until = NULL, pinned_at = NULL, pinned_by = NULL
   WHERE is_pinned = true AND pinned_until IS NOT NULL AND pinned_until <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END$$;
GRANT EXECUTE ON FUNCTION public.expire_pinned_posts() TO authenticated;

-- Các RPC quản trị bài viết chuẩn (nếu chưa có)
CREATE OR REPLACE FUNCTION public.admin_lock_post(p_post_id uuid, p_lock boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.posts SET is_locked = COALESCE(p_lock,false) WHERE id = p_post_id;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_lock_post(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_comments_disabled(p_post_id uuid, p_disabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.posts SET comments_disabled = COALESCE(p_disabled,false) WHERE id = p_post_id;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_set_comments_disabled(uuid,boolean) TO authenticated;

-- ============ 8) DELETE ALL POSTS ============
CREATE OR REPLACE FUNCTION public.admin_delete_all_posts(_confirm text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF _confirm IS DISTINCT FROM 'DELETE ALL POSTS' THEN
    RAISE EXCEPTION 'Confirmation phrase required';
  END IF;
  DELETE FROM public.posts;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_all_posts(text) TO authenticated;

-- Admin override policy cho posts (tránh Forbidden khi xoá / cập nhật)
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts admin all" ON public.posts;
CREATE POLICY "posts admin all"
  ON public.posts FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ============ 9) USER RESTRICTIONS ============
CREATE TABLE IF NOT EXISTS public.user_restrictions (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ban_posting  boolean NOT NULL DEFAULT false,
  ban_comment  boolean NOT NULL DEFAULT false,
  ban_message  boolean NOT NULL DEFAULT false,
  account_locked boolean NOT NULL DEFAULT false,
  reason       text,
  until_at     timestamptz,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_restrictions TO authenticated;
GRANT ALL    ON public.user_restrictions TO service_role;

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='user_restrictions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_restrictions', p.policyname);
  END LOOP;
END$$;

CREATE POLICY "user_restrictions self or admin"
  ON public.user_restrictions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_current_user_admin());

CREATE POLICY "user_restrictions admin write"
  ON public.user_restrictions FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

CREATE OR REPLACE FUNCTION public.admin_ban_user(
  _user_id uuid,
  _ban_posting boolean DEFAULT NULL,
  _ban_comment boolean DEFAULT NULL,
  _ban_message boolean DEFAULT NULL,
  _account_locked boolean DEFAULT NULL,
  _reason text DEFAULT NULL,
  _until timestamptz DEFAULT NULL
) RETURNS public.user_restrictions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.user_restrictions;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.user_restrictions AS ur
    (user_id, ban_posting, ban_comment, ban_message, account_locked,
     reason, until_at, updated_by, updated_at)
  VALUES
    (_user_id, COALESCE(_ban_posting,false), COALESCE(_ban_comment,false),
     COALESCE(_ban_message,false), COALESCE(_account_locked,false),
     _reason, _until, auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET ban_posting    = COALESCE(EXCLUDED.ban_posting,    ur.ban_posting),
        ban_comment    = COALESCE(EXCLUDED.ban_comment,    ur.ban_comment),
        ban_message    = COALESCE(EXCLUDED.ban_message,    ur.ban_message),
        account_locked = COALESCE(EXCLUDED.account_locked, ur.account_locked),
        reason         = COALESCE(EXCLUDED.reason,         ur.reason),
        until_at       = COALESCE(EXCLUDED.until_at,       ur.until_at),
        updated_by     = auth.uid(),
        updated_at     = now()
  RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid,boolean,boolean,boolean,boolean,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unban_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.user_restrictions
     SET ban_posting=false, ban_comment=false, ban_message=false,
         account_locked=false, until_at=NULL,
         updated_by=auth.uid(), updated_at=now()
   WHERE user_id = _user_id;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;

-- ============ 10) BLACKLIST (phone / fingerprint / ip) ============
CREATE TABLE IF NOT EXISTS public.blacklist_entries (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('phone','fingerprint','ip','email')),
  value      text NOT NULL,
  reason     text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
CREATE INDEX IF NOT EXISTS blacklist_kind_idx ON public.blacklist_entries(kind);

ALTER TABLE public.blacklist_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.blacklist_entries TO authenticated;
GRANT ALL    ON public.blacklist_entries TO service_role;

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='blacklist_entries' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.blacklist_entries', p.policyname);
  END LOOP;
END$$;

CREATE POLICY "blacklist admin all"
  ON public.blacklist_entries FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

CREATE OR REPLACE FUNCTION public.admin_blacklist_add(
  _kind text, _value text, _reason text DEFAULT NULL
) RETURNS public.blacklist_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.blacklist_entries;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.blacklist_entries(kind, value, reason, created_by)
  VALUES (_kind, _value, _reason, auth.uid())
  ON CONFLICT (kind, value) DO UPDATE SET reason = EXCLUDED.reason
  RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_blacklist_add(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_blacklist_remove(_kind text, _value text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.blacklist_entries WHERE kind=_kind AND value=_value;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_blacklist_remove(text,text) TO authenticated;

-- Xoá vĩnh viễn user + blacklist phone/fingerprint kèm theo
CREATE OR REPLACE FUNCTION public.admin_delete_user_permanent(
  _user_id uuid, _fingerprint text DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE phone_val text;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;

  -- Lấy phone từ profiles (nếu có cột)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='profiles'
               AND column_name='phone') THEN
    EXECUTE 'SELECT phone FROM public.profiles WHERE id = $1'
       INTO phone_val USING _user_id;
  END IF;

  IF phone_val IS NOT NULL AND phone_val <> '' THEN
    INSERT INTO public.blacklist_entries(kind, value, reason, created_by)
    VALUES ('phone', phone_val, _reason, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
  IF _fingerprint IS NOT NULL AND _fingerprint <> '' THEN
    INSERT INTO public.blacklist_entries(kind, value, reason, created_by)
    VALUES ('fingerprint', _fingerprint, _reason, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.posts       WHERE user_id = _user_id;
  DELETE FROM public.profiles    WHERE id      = _user_id;
  DELETE FROM auth.users         WHERE id      = _user_id;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_permanent(uuid,text,text) TO authenticated;

-- ============ 11) COMMENTS / MESSAGES admin override ============
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='comments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "comments admin all" ON public.comments';
    EXECUTE 'CREATE POLICY "comments admin all" ON public.comments
               FOR ALL TO authenticated
               USING (public.is_current_user_admin())
               WITH CHECK (public.is_current_user_admin())';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "messages admin all" ON public.messages';
    EXECUTE 'CREATE POLICY "messages admin all" ON public.messages
               FOR ALL TO authenticated
               USING (public.is_current_user_admin())
               WITH CHECK (public.is_current_user_admin())';
  END IF;
END$$;

COMMIT;

-- =====================================================================
-- KIỂM TRA NHANH sau khi chạy (không bắt buộc):
--   SELECT public.is_current_user_admin();
--   SELECT public.admin_add_keyword('ví_dụ','medium',5);
--   SELECT public.admin_moderation_stats(30);
--   SELECT public.expire_pinned_posts();
-- =====================================================================
