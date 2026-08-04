-- =====================================================================
-- Admin Members Manager v2 — additive, idempotent migration.
-- Compatible with the CURRENT production schema:
--   * public.device_accounts(id, user_id, fingerprint, ip, user_agent, created_at)
--   * public.device_registrations, public.blocked_devices  (already exist)
-- Does NOT create user_devices. Does NOT drop / recreate any table.
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Site settings: admin_contact_url + verify_required copy
-- ---------------------------------------------------------------------
INSERT INTO public.admin_site_settings (key, value)
VALUES
  ('admin_contact_url', '{"url":"https://www.facebook.com/share/1BjMYa8H27/?mibextid=wwXIfr"}'::jsonb),
  ('verify_required',   '{"title":"Tài khoản cần xác minh","description":"Tài khoản của bạn hiện cần được Admin xác minh trước khi sử dụng. Vui lòng liên hệ Admin để được hỗ trợ.","image":null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_site_settings' AND policyname = 'settings_public_read'
  ) THEN
    CREATE POLICY settings_public_read ON public.admin_site_settings
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) Extend user_restrictions.kind to support verify_required + permanent_ban
-- ---------------------------------------------------------------------
DO $$
DECLARE con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.user_restrictions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kind%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_restrictions DROP CONSTRAINT %I', con_name);
  END IF;
  ALTER TABLE public.user_restrictions
    ADD CONSTRAINT user_restrictions_kind_check
    CHECK (kind IN (
      'suspend','post','comment','like','message','find_zalo',
      'avatar_change','bio_change','gift','nearby',
      'verify_required','permanent_ban'
    ));
END $$;

-- ---------------------------------------------------------------------
-- 3) RPC: duplicate-IP counts + accounts-by-IP  (uses device_accounts)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ip_duplicate_counts(_user_ids uuid[])
RETURNS TABLE (user_id uuid, latest_ip text, dup_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (d.user_id) d.user_id, d.ip
      FROM public.device_accounts d
     WHERE d.user_id = ANY(_user_ids) AND d.ip IS NOT NULL
     ORDER BY d.user_id, d.created_at DESC NULLS LAST
  )
  SELECT
    l.user_id,
    l.ip,
    (SELECT COUNT(DISTINCT d2.user_id)::int
       FROM public.device_accounts d2
      WHERE d2.ip = l.ip) AS dup_count
  FROM latest l;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ip_duplicate_counts(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_accounts_by_ip(_ip text)
RETURNS TABLE (
  user_id uuid, username text, full_name text, avatar text, phone text,
  is_banned boolean, created_at timestamptz, last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (p.id)
    p.id, p.username, p.full_name, p.avatar, p.phone,
    COALESCE(p.is_banned, false), p.created_at, p.last_seen
  FROM public.device_accounts d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE d.ip = _ip
  ORDER BY p.id, p.last_seen DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.admin_accounts_by_ip(text) TO authenticated;

-- Fingerprint duplicate lookup — same shape, using device_accounts.fingerprint.
CREATE OR REPLACE FUNCTION public.admin_accounts_by_fingerprint(_fp text)
RETURNS TABLE (
  user_id uuid, username text, full_name text, avatar text, phone text,
  is_banned boolean, created_at timestamptz, last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (p.id)
    p.id, p.username, p.full_name, p.avatar, p.phone,
    COALESCE(p.is_banned, false), p.created_at, p.last_seen
  FROM public.device_accounts d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE d.fingerprint = _fp
  ORDER BY p.id, p.last_seen DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.admin_accounts_by_fingerprint(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) RPC: unified member history (logins/password/messages/posts/comments/transfers/lucky_money)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_user_history(
  _user uuid,
  _kind text,
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
)
RETURNS TABLE (id text, occurred_at timestamptz, title text, body text, extra jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    auth.uid() = _user OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false))
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _kind = 'logins' THEN
    RETURN QUERY
      SELECT d.id::text, d.created_at,
             COALESCE(d.ip, '—') AS title,
             COALESCE(d.user_agent, '—') AS body,
             jsonb_build_object('fingerprint', d.fingerprint, 'ip', d.ip, 'user_agent', d.user_agent) AS extra
        FROM public.device_accounts d
       WHERE d.user_id = _user
       ORDER BY d.created_at DESC NULLS LAST
       LIMIT _limit OFFSET _offset;

  ELSIF _kind = 'password' THEN
    RETURN QUERY
      SELECT a.id::text, a.created_at,
             'Đổi mật khẩu'::text AS title,
             COALESCE(a.description, '') AS body,
             a.metadata AS extra
        FROM public.activity_logs a
       WHERE a.user_id = _user
         AND a.action_type IN ('password_change','password_reset','admin_reset_password')
       ORDER BY a.created_at DESC
       LIMIT _limit OFFSET _offset;

  ELSIF _kind = 'messages' THEN
    RETURN QUERY
      SELECT m.id::text, m.created_at,
             'Gửi tin nhắn'::text AS title,
             LEFT(COALESCE(m.content, ''), 200) AS body,
             jsonb_build_object('conversation_id', m.conversation_id) AS extra
        FROM public.messages m
       WHERE m.sender_id = _user
       ORDER BY m.created_at DESC
       LIMIT _limit OFFSET _offset;

  ELSIF _kind = 'posts' THEN
    RETURN QUERY
      SELECT p.id::text, p.created_at,
             ('Đăng bài · ' || COALESCE(p.category, 'general'))::text AS title,
             LEFT(COALESCE(p.content, ''), 200) AS body,
             jsonb_build_object('visibility', p.visibility, 'status', p.status) AS extra
        FROM public.posts p
       WHERE p.user_id = _user
       ORDER BY p.created_at DESC
       LIMIT _limit OFFSET _offset;

  ELSIF _kind = 'comments' THEN
    RETURN QUERY
      SELECT c.id::text, c.created_at,
             'Bình luận'::text AS title,
             LEFT(COALESCE(c.content, ''), 200) AS body,
             jsonb_build_object('post_id', c.post_id) AS extra
        FROM public.comments c
       WHERE c.user_id = _user
       ORDER BY c.created_at DESC
       LIMIT _limit OFFSET _offset;

  ELSIF _kind = 'transfers' THEN
    RETURN QUERY
      SELECT g.id::text, g.created_at,
             (CASE WHEN g.user_id = _user THEN 'Chi ' ELSE 'Nhận ' END
                || COALESCE(g.type, 'gem'))::text AS title,
             COALESCE(g.description, '')::text AS body,
             jsonb_build_object('amount', g.amount, 'balance', g.balance_after) AS extra
        FROM public.gem_history g
       WHERE g.user_id = _user
         AND COALESCE(g.type,'') IN ('transfer_in','transfer_out','gift_sent','gift_received')
       ORDER BY g.created_at DESC
       LIMIT _limit OFFSET _offset;

  ELSIF _kind = 'lucky_money' THEN
    RETURN QUERY
      SELECT g.id::text, g.created_at,
             (CASE WHEN g.user_id = _user THEN 'Lì xì đi ' ELSE 'Nhận lì xì ' END)::text AS title,
             COALESCE(g.description, '')::text AS body,
             jsonb_build_object('amount', g.amount) AS extra
        FROM public.gem_history g
       WHERE g.user_id = _user
         AND (COALESCE(g.type,'') ILIKE '%red_packet%'
              OR COALESCE(g.type,'') ILIKE '%lucky%'
              OR COALESCE(g.description,'') ILIKE '%lì xì%')
       ORDER BY g.created_at DESC
       LIMIT _limit OFFSET _offset;

  ELSE
    RETURN;
  END IF;

EXCEPTION WHEN undefined_table OR undefined_column THEN
  RETURN;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_user_history(uuid, text, int, int) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Bulk verification: require / approve / reject
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_require_verification(_users uuid[], _reason text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int := 0; uid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_admin,false)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOREACH uid IN ARRAY _users LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.user_restrictions
       WHERE user_id = uid AND kind = 'verify_required'
         AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
    ) THEN
      INSERT INTO public.user_restrictions(user_id, kind, reason, created_by)
        VALUES (uid, 'verify_required', _reason, auth.uid());
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_require_verification(uuid[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_verification_bulk(_users uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_admin,false)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.user_restrictions
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE user_id = ANY(_users)
     AND kind = 'verify_required'
     AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  BEGIN
    UPDATE public.profiles
       SET verified = true, verified_at = now(), verify_reason = NULL
     WHERE id = ANY(_users);
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_approve_verification_bulk(uuid[]) TO authenticated;

-- Reject = giữ nguyên restriction verify_required + ghi lý do.
CREATE OR REPLACE FUNCTION public.admin_reject_verification_bulk(_users uuid[], _reason text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_admin,false)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.user_restrictions
     SET reason = COALESCE(_reason, reason)
   WHERE user_id = ANY(_users)
     AND kind = 'verify_required'
     AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  BEGIN
    UPDATE public.profiles SET verified = false WHERE id = ANY(_users);
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reject_verification_bulk(uuid[], text) TO authenticated;
