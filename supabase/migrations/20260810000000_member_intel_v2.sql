-- =====================================================================
-- Member Intelligence V2 — Anti Clone + Anti Spam + Risk Score
-- Additive & idempotent. KHÔNG đổi Supabase URL / API Key / Project.
-- Dựa trên schema hiện có:
--   public.device_accounts(id, user_id, fingerprint, ip, user_agent, created_at)
--   public.blocked_devices, public.device_registrations, public.activity_logs
--   public.profiles, public.user_restrictions
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) device_accounts: bổ sung cột thông tin thiết bị
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  fingerprint text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_accounts ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE public.device_accounts ADD COLUMN IF NOT EXISTS os          text;
ALTER TABLE public.device_accounts ADD COLUMN IF NOT EXISTS browser     text;
ALTER TABLE public.device_accounts ADD COLUMN IF NOT EXISTS country     text;
ALTER TABLE public.device_accounts ADD COLUMN IF NOT EXISTS isp         text;
ALTER TABLE public.device_accounts ADD COLUMN IF NOT EXISTS cookie_id   text;
ALTER TABLE public.device_accounts ADD COLUMN IF NOT EXISTS last_seen   timestamptz;

CREATE INDEX IF NOT EXISTS device_accounts_user_idx    ON public.device_accounts(user_id);
CREATE INDEX IF NOT EXISTS device_accounts_fp_idx      ON public.device_accounts(fingerprint);
CREATE INDEX IF NOT EXISTS device_accounts_ip_idx      ON public.device_accounts(ip);
CREATE INDEX IF NOT EXISTS device_accounts_cookie_idx  ON public.device_accounts(cookie_id);
CREATE INDEX IF NOT EXISTS device_accounts_created_idx ON public.device_accounts(created_at DESC);

ALTER TABLE public.device_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.device_accounts TO authenticated;
GRANT ALL ON public.device_accounts TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='device_accounts' AND policyname='device_accounts_self_rw') THEN
    CREATE POLICY device_accounts_self_rw ON public.device_accounts
      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='device_accounts' AND policyname='device_accounts_admin_read') THEN
    CREATE POLICY device_accounts_admin_read ON public.device_accounts
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Bảng chặn: device / ip  (3 mức khoá)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_devices_fp_uidx ON public.blocked_devices(fingerprint);
ALTER TABLE public.blocked_devices ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.blocked_devices TO authenticated;
GRANT ALL ON public.blocked_devices TO service_role;

CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_ips_ip_uidx ON public.blocked_ips(ip);
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.blocked_ips TO authenticated;
GRANT ALL ON public.blocked_ips TO service_role;

-- ---------------------------------------------------------------------
-- 2) Nhật ký hoạt động thành viên
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,           -- login/logout/register/ip_change/device_change/ban/unban/spam/...
  detail text,
  ip text,
  fingerprint text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_activity_user_idx ON public.member_activity_log(user_id, created_at DESC);
ALTER TABLE public.member_activity_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.member_activity_log TO authenticated;
GRANT ALL ON public.member_activity_log TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='member_activity_log' AND policyname='mal_self_insert') THEN
    CREATE POLICY mal_self_insert ON public.member_activity_log
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='member_activity_log' AND policyname='mal_read') THEN
    CREATE POLICY mal_read ON public.member_activity_log
      FOR SELECT TO authenticated
      USING (user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) Helper: is_admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mi_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false));
$$;
GRANT EXECUTE ON FUNCTION public.mi_is_admin() TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Ghi nhận tín hiệu thiết bị (gọi sau khi đăng nhập / mở app)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_device_signal(
  p_fingerprint text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_os text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_isp text DEFAULT NULL,
  p_cookie_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); prev record;
BEGIN
  IF uid IS NULL OR p_fingerprint IS NULL THEN RETURN; END IF;

  SELECT * INTO prev FROM public.device_accounts
   WHERE user_id = uid ORDER BY COALESCE(last_seen, created_at) DESC LIMIT 1;

  IF prev.id IS NOT NULL AND prev.fingerprint IS DISTINCT FROM p_fingerprint THEN
    INSERT INTO public.member_activity_log(user_id, action, detail, ip, fingerprint)
      VALUES (uid, 'device_change', prev.fingerprint || ' → ' || p_fingerprint, p_ip, p_fingerprint);
  ELSIF prev.id IS NOT NULL AND p_ip IS NOT NULL AND prev.ip IS DISTINCT FROM p_ip THEN
    INSERT INTO public.member_activity_log(user_id, action, detail, ip, fingerprint)
      VALUES (uid, 'ip_change', COALESCE(prev.ip,'—') || ' → ' || p_ip, p_ip, p_fingerprint);
  END IF;

  UPDATE public.device_accounts SET
    ip = COALESCE(p_ip, ip), user_agent = COALESCE(p_user_agent, user_agent),
    device_type = COALESCE(p_device_type, device_type), os = COALESCE(p_os, os),
    browser = COALESCE(p_browser, browser), country = COALESCE(p_country, country),
    isp = COALESCE(p_isp, isp), cookie_id = COALESCE(p_cookie_id, cookie_id),
    last_seen = now()
  WHERE user_id = uid AND fingerprint = p_fingerprint;

  IF NOT FOUND THEN
    INSERT INTO public.device_accounts(
      user_id, fingerprint, ip, user_agent, device_type, os, browser, country, isp, cookie_id, last_seen)
    VALUES (uid, p_fingerprint, p_ip, p_user_agent, p_device_type, p_os, p_browser, p_country, p_isp, p_cookie_id, now());
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.register_device_signal(text,text,text,text,text,text,text,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Kiểm tra chặn (anon gọi được — dùng trước khi login/đăng ký)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_device_access(p_fingerprint text, p_ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_ip IS NOT NULL AND EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip = p_ip) THEN
    RETURN jsonb_build_object('blocked', true, 'scope', 'ip',
      'message', 'Thiết bị hoặc mạng của bạn đã bị chặn.');
  END IF;
  IF p_fingerprint IS NOT NULL AND EXISTS (SELECT 1 FROM public.blocked_devices WHERE fingerprint = p_fingerprint) THEN
    RETURN jsonb_build_object('blocked', true, 'scope', 'device',
      'message', 'Thiết bị này đã bị khóa.');
  END IF;
  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.check_device_access(text,text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) VIEW: hồ sơ thiết bị mới nhất + các chỉ số trùng lặp
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.member_device_latest AS
  SELECT DISTINCT ON (d.user_id)
    d.user_id, d.fingerprint, d.ip, d.user_agent, d.device_type, d.os,
    d.browser, d.country, d.isp, d.cookie_id,
    COALESCE(d.last_seen, d.created_at) AS device_seen_at
  FROM public.device_accounts d
  ORDER BY d.user_id, COALESCE(d.last_seen, d.created_at) DESC NULLS LAST;

-- ---------------------------------------------------------------------
-- 7) RPC: danh sách thành viên + Risk Score V2
-- p_flags: mảng cờ lọc nhanh
--   dup_ip | dup_device | dup_cookie | risk60 | risk80 | acc3 | acc5 | acc10 | clone | spam
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_member_intel(
  p_q text DEFAULT NULL,
  p_flags text[] DEFAULT NULL,
  p_min_risk int DEFAULT 0,
  p_sort text DEFAULT 'risk',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, phone text,
  is_admin boolean, is_banned boolean, created_at timestamptz, last_seen timestamptz,
  fingerprint text, ip text, device_type text, os text, browser text,
  country text, isp text, cookie_id text, device_seen_at timestamptz,
  ip_account_count int, device_account_count int, cookie_account_count int,
  ip_change_count int, spam_posts int, spam_messages int, spam_comments int,
  name_twin_count int, avatar_twin_count int,
  risk_score int, risk_reasons text[], total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.username, p.full_name, p.avatar, p.phone,
           COALESCE(p.is_admin,false) AS is_admin, COALESCE(p.is_banned,false) AS is_banned,
           p.created_at, p.last_seen
      FROM public.profiles p
     WHERE p_q IS NULL OR p_q = ''
        OR p.username ILIKE '%'||p_q||'%'
        OR COALESCE(p.full_name,'') ILIKE '%'||p_q||'%'
        OR COALESCE(p.phone,'')     ILIKE '%'||p_q||'%'
  ),
  dev AS (SELECT * FROM public.member_device_latest),
  ipc AS (SELECT d.ip, COUNT(DISTINCT d.user_id)::int c FROM public.device_accounts d
           WHERE d.ip IS NOT NULL GROUP BY d.ip),
  fpc AS (SELECT d.fingerprint, COUNT(DISTINCT d.user_id)::int c FROM public.device_accounts d
           WHERE d.fingerprint IS NOT NULL GROUP BY d.fingerprint),
  ckc AS (SELECT d.cookie_id, COUNT(DISTINCT d.user_id)::int c FROM public.device_accounts d
           WHERE d.cookie_id IS NOT NULL GROUP BY d.cookie_id),
  ipch AS (SELECT d.user_id, COUNT(DISTINCT d.ip)::int c FROM public.device_accounts d
            WHERE d.ip IS NOT NULL GROUP BY d.user_id),
  namec AS (SELECT lower(btrim(COALESCE(p.full_name,''))) k, COUNT(*)::int c
              FROM public.profiles p WHERE COALESCE(p.full_name,'') <> '' GROUP BY 1),
  avac AS (SELECT p.avatar k, COUNT(*)::int c
             FROM public.profiles p WHERE COALESCE(p.avatar,'') <> '' GROUP BY 1),
  calc AS (
    SELECT b.*,
      dv.fingerprint, dv.ip, dv.device_type, dv.os, dv.browser, dv.country, dv.isp,
      dv.cookie_id, dv.device_seen_at,
      COALESCE(ipc.c,0)  AS ip_account_count,
      COALESCE(fpc.c,0)  AS device_account_count,
      COALESCE(ckc.c,0)  AS cookie_account_count,
      COALESCE(ipch.c,0) AS ip_change_count,
      COALESCE((SELECT COUNT(*)::int FROM public.posts x
                 WHERE x.user_id=b.id AND x.created_at > now()-interval '24 hours'),0) AS spam_posts,
      COALESCE((SELECT COUNT(*)::int FROM public.messages x
                 WHERE x.sender_id=b.id AND x.created_at > now()-interval '24 hours'),0) AS spam_messages,
      COALESCE((SELECT COUNT(*)::int FROM public.comments x
                 WHERE x.user_id=b.id AND x.created_at > now()-interval '24 hours'),0) AS spam_comments,
      COALESCE(namec.c,1) AS name_twin_count,
      COALESCE(avac.c,1)  AS avatar_twin_count
    FROM base b
    LEFT JOIN dev  dv   ON dv.user_id = b.id
    LEFT JOIN ipc       ON ipc.ip = dv.ip
    LEFT JOIN fpc       ON fpc.fingerprint = dv.fingerprint
    LEFT JOIN ckc       ON ckc.cookie_id = dv.cookie_id
    LEFT JOIN ipch      ON ipch.user_id = b.id
    LEFT JOIN namec     ON namec.k = lower(btrim(COALESCE(b.full_name,'')))
    LEFT JOIN avac      ON avac.k = b.avatar
  ),
  scored AS (
    SELECT c.*,
      LEAST(100, GREATEST(0,
          LEAST(35, GREATEST(0, c.device_account_count - 1) * 12)
        + LEAST(20, GREATEST(0, c.ip_account_count - 1) * 5)
        + LEAST(10, GREATEST(0, c.cookie_account_count - 1) * 6)
        + LEAST(8,  GREATEST(0, c.ip_change_count - 2) * 2)
        + LEAST(10, (c.spam_posts / 10) + (c.spam_messages / 40) + (c.spam_comments / 20))
        + CASE WHEN c.name_twin_count   > 1 THEN 6 ELSE 0 END
        + CASE WHEN c.avatar_twin_count > 1 THEN 6 ELSE 0 END
        + CASE WHEN c.created_at > now() - interval '24 hours'
                AND c.device_account_count > 1 THEN 8 ELSE 0 END
      ))::int AS risk_score,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN c.device_account_count > 1 THEN c.device_account_count || ' tài khoản cùng Device' END,
        CASE WHEN c.ip_account_count     > 1 THEN c.ip_account_count || ' tài khoản cùng IP' END,
        CASE WHEN c.cookie_account_count > 1 THEN c.cookie_account_count || ' tài khoản cùng Cookie' END,
        CASE WHEN c.ip_change_count      > 3 THEN 'Đổi IP ' || c.ip_change_count || ' lần' END,
        CASE WHEN c.spam_posts    > 20 THEN 'Spam bài (' || c.spam_posts || '/24h)' END,
        CASE WHEN c.spam_messages > 80 THEN 'Spam tin nhắn (' || c.spam_messages || '/24h)' END,
        CASE WHEN c.spam_comments > 40 THEN 'Spam bình luận (' || c.spam_comments || '/24h)' END,
        CASE WHEN c.name_twin_count   > 1 THEN 'Tên gần giống tài khoản khác' END,
        CASE WHEN c.avatar_twin_count > 1 THEN 'Avatar giống tài khoản khác' END
      ], NULL) AS risk_reasons
    FROM calc c
  ),
  filtered AS (
    SELECT * FROM scored s
     WHERE s.risk_score >= COALESCE(p_min_risk,0)
       AND (p_flags IS NULL OR array_length(p_flags,1) IS NULL OR (
              (NOT 'dup_ip'     = ANY(p_flags) OR s.ip_account_count > 1)
          AND (NOT 'dup_device' = ANY(p_flags) OR s.device_account_count > 1)
          AND (NOT 'dup_cookie' = ANY(p_flags) OR s.cookie_account_count > 1)
          AND (NOT 'risk60'     = ANY(p_flags) OR s.risk_score > 60)
          AND (NOT 'risk80'     = ANY(p_flags) OR s.risk_score > 80)
          AND (NOT 'acc3'       = ANY(p_flags) OR GREATEST(s.device_account_count, s.ip_account_count) > 3)
          AND (NOT 'acc5'       = ANY(p_flags) OR GREATEST(s.device_account_count, s.ip_account_count) > 5)
          AND (NOT 'acc10'      = ANY(p_flags) OR GREATEST(s.device_account_count, s.ip_account_count) > 10)
          AND (NOT 'clone'      = ANY(p_flags) OR s.device_account_count > 1 OR s.ip_account_count > 2)
          AND (NOT 'spam'       = ANY(p_flags) OR s.spam_posts > 20 OR s.spam_messages > 80 OR s.spam_comments > 40)
       ))
  )
  SELECT f.id, f.username, f.full_name, f.avatar, f.phone, f.is_admin, f.is_banned,
         f.created_at, f.last_seen, f.fingerprint, f.ip, f.device_type, f.os, f.browser,
         f.country, f.isp, f.cookie_id, f.device_seen_at,
         f.ip_account_count, f.device_account_count, f.cookie_account_count,
         f.ip_change_count, f.spam_posts, f.spam_messages, f.spam_comments,
         f.name_twin_count, f.avatar_twin_count, f.risk_score, f.risk_reasons,
         COUNT(*) OVER () AS total_count
    FROM filtered f
   ORDER BY
     CASE WHEN p_sort = 'risk'    THEN f.risk_score END DESC NULLS LAST,
     CASE WHEN p_sort = 'newest'  THEN f.created_at END DESC NULLS LAST,
     CASE WHEN p_sort = 'online'  THEN f.last_seen  END DESC NULLS LAST,
     f.created_at DESC
   LIMIT COALESCE(p_limit,50) OFFSET COALESCE(p_offset,0);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_member_intel(text,text[],int,text,int,int) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Chi tiết cụm theo IP / Device
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_cluster_detail(p_scope text, p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE info jsonb; accounts jsonb; ips jsonb; devices jsonb; blocked boolean;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
      'country', max(d.country), 'isp', max(d.isp), 'browser', max(d.browser),
      'os', max(d.os), 'device_type', max(d.device_type),
      'user_agent', max(d.user_agent),
      'first_seen', min(d.created_at), 'last_seen', max(COALESCE(d.last_seen, d.created_at)))
    INTO info
    FROM public.device_accounts d
   WHERE (p_scope = 'ip' AND d.ip = p_key) OR (p_scope = 'device' AND d.fingerprint = p_key);

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'last_seen' DESC), '[]'::jsonb) INTO accounts
    FROM (
      SELECT DISTINCT ON (p.id) jsonb_build_object(
        'id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar', p.avatar,
        'phone', p.phone, 'is_banned', COALESCE(p.is_banned,false),
        'created_at', p.created_at, 'last_seen', p.last_seen) AS x
        FROM public.device_accounts d
        JOIN public.profiles p ON p.id = d.user_id
       WHERE (p_scope = 'ip' AND d.ip = p_key) OR (p_scope = 'device' AND d.fingerprint = p_key)
       ORDER BY p.id
    ) s;

  SELECT COALESCE(jsonb_agg(DISTINCT d.ip), '[]'::jsonb) INTO ips
    FROM public.device_accounts d
   WHERE d.ip IS NOT NULL
     AND ((p_scope = 'ip' AND d.ip = p_key) OR (p_scope = 'device' AND d.fingerprint = p_key));

  SELECT COALESCE(jsonb_agg(DISTINCT d.fingerprint), '[]'::jsonb) INTO devices
    FROM public.device_accounts d
   WHERE d.fingerprint IS NOT NULL
     AND ((p_scope = 'ip' AND d.ip = p_key) OR (p_scope = 'device' AND d.fingerprint = p_key));

  blocked := CASE
    WHEN p_scope = 'ip' THEN EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip = p_key)
    ELSE EXISTS (SELECT 1 FROM public.blocked_devices WHERE fingerprint = p_key) END;

  RETURN jsonb_build_object('scope', p_scope, 'key', p_key, 'info', COALESCE(info,'{}'::jsonb),
    'accounts', accounts, 'ips', ips, 'devices', devices, 'blocked', blocked,
    'account_count', jsonb_array_length(accounts));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_cluster_detail(text,text) TO authenticated;

-- Danh sách cụm (Identity Cluster) theo Device, kèm số tài khoản + risk
CREATE OR REPLACE FUNCTION public.admin_identity_clusters(
  p_scope text DEFAULT 'device', p_min_accounts int DEFAULT 2,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
)
RETURNS TABLE (cluster_key text, account_count int, ip_count int, banned_count int,
               last_seen timestamptz, usernames text[], risk_score int, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH g AS (
    SELECT CASE WHEN p_scope = 'ip' THEN d.ip ELSE d.fingerprint END AS k, d.user_id, d.ip,
           COALESCE(d.last_seen, d.created_at) AS seen
      FROM public.device_accounts d
     WHERE CASE WHEN p_scope = 'ip' THEN d.ip ELSE d.fingerprint END IS NOT NULL
  ), agg AS (
    SELECT g.k,
           COUNT(DISTINCT g.user_id)::int AS account_count,
           COUNT(DISTINCT g.ip)::int      AS ip_count,
           MAX(g.seen)                    AS last_seen,
           (SELECT COUNT(*)::int FROM public.profiles p
             WHERE p.id IN (SELECT DISTINCT user_id FROM g g2 WHERE g2.k = g.k)
               AND COALESCE(p.is_banned,false))                        AS banned_count,
           (SELECT ARRAY_AGG(p.username) FROM public.profiles p
             WHERE p.id IN (SELECT DISTINCT user_id FROM g g3 WHERE g3.k = g.k)) AS usernames
      FROM g GROUP BY g.k
  )
  SELECT a.k, a.account_count, a.ip_count, a.banned_count, a.last_seen, a.usernames,
         LEAST(100, a.account_count * (CASE WHEN p_scope='ip' THEN 8 ELSE 12 END) + a.ip_count * 2)::int,
         COUNT(*) OVER ()
    FROM agg a
   WHERE a.account_count >= COALESCE(p_min_accounts,2)
   ORDER BY a.account_count DESC, a.last_seen DESC
   LIMIT COALESCE(p_limit,50) OFFSET COALESCE(p_offset,0);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_identity_clusters(text,int,int,int) TO authenticated;

-- ---------------------------------------------------------------------
-- 9) Hành động hàng loạt trên cụm
-- p_action: ban_all | unban_all | logout_all | mark_spam | block | unblock
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_cluster_action(p_scope text, p_key text, p_action text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uids uuid[]; n int := 0;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT ARRAY_AGG(DISTINCT d.user_id) INTO uids FROM public.device_accounts d
   WHERE d.user_id IS NOT NULL
     AND ((p_scope='ip' AND d.ip = p_key) OR (p_scope='device' AND d.fingerprint = p_key));
  uids := COALESCE(uids, ARRAY[]::uuid[]);

  IF p_action = 'ban_all' THEN
    UPDATE public.profiles SET is_banned = true WHERE id = ANY(uids) AND NOT COALESCE(is_admin,false);
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO public.member_activity_log(user_id, action, detail, ip, fingerprint)
      SELECT u, 'ban', COALESCE(p_reason,'Khóa theo cụm ' || p_scope),
             CASE WHEN p_scope='ip' THEN p_key END, CASE WHEN p_scope='device' THEN p_key END
        FROM unnest(uids) u;

  ELSIF p_action = 'unban_all' THEN
    UPDATE public.profiles SET is_banned = false, banned_until = NULL WHERE id = ANY(uids);
    GET DIAGNOSTICS n = ROW_COUNT;
    DELETE FROM public.blocked_devices WHERE fingerprint IN (
      SELECT DISTINCT fingerprint FROM public.device_accounts WHERE user_id = ANY(uids) AND fingerprint IS NOT NULL);
    DELETE FROM public.blocked_ips WHERE ip IN (
      SELECT DISTINCT ip FROM public.device_accounts WHERE user_id = ANY(uids) AND ip IS NOT NULL);
    INSERT INTO public.member_activity_log(user_id, action, detail)
      SELECT u, 'unban', 'Mở khóa theo cụm ' || p_scope FROM unnest(uids) u;

  ELSIF p_action = 'logout_all' THEN
    UPDATE public.profiles SET is_online = false, last_seen = now() WHERE id = ANY(uids);
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO public.member_activity_log(user_id, action, detail)
      SELECT u, 'logout', 'Admin buộc đăng xuất (cụm ' || p_scope || ')' FROM unnest(uids) u;

  ELSIF p_action = 'mark_spam' THEN
    INSERT INTO public.member_activity_log(user_id, action, detail)
      SELECT u, 'spam', COALESCE(p_reason, 'Admin đánh dấu Spam (cụm ' || p_scope || ')') FROM unnest(uids) u;
    n := COALESCE(array_length(uids,1),0);

  ELSIF p_action = 'block' THEN
    IF p_scope = 'ip' THEN
      INSERT INTO public.blocked_ips(ip, reason, created_by) VALUES (p_key, p_reason, auth.uid())
        ON CONFLICT (ip) DO NOTHING;
    ELSE
      INSERT INTO public.blocked_devices(fingerprint, reason, created_by) VALUES (p_key, p_reason, auth.uid())
        ON CONFLICT (fingerprint) DO NOTHING;
    END IF;
    n := 1;

  ELSIF p_action = 'unblock' THEN
    IF p_scope = 'ip' THEN DELETE FROM public.blocked_ips WHERE ip = p_key;
    ELSE DELETE FROM public.blocked_devices WHERE fingerprint = p_key; END IF;
    n := 1;
  ELSE
    RAISE EXCEPTION 'unknown action %', p_action;
  END IF;

  RETURN jsonb_build_object('ok', true, 'affected', n, 'users', COALESCE(array_length(uids,1),0));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_cluster_action(text,text,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 10) Khoá tài khoản 3 mức: 1=account, 2=account+device, 3=account+device+ip
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ban_member_level(
  p_user uuid, p_level int, p_reason text DEFAULT NULL, p_days int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fp text; v_ip text; until timestamptz;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  until := CASE WHEN COALESCE(p_days,0) > 0 THEN now() + (p_days || ' days')::interval END;

  UPDATE public.profiles SET is_banned = true, banned_until = until WHERE id = p_user;

  SELECT d.fingerprint, d.ip INTO fp, v_ip FROM public.member_device_latest d WHERE d.user_id = p_user;

  IF p_level >= 2 AND fp IS NOT NULL THEN
    INSERT INTO public.blocked_devices(fingerprint, reason, created_by)
      VALUES (fp, COALESCE(p_reason,'admin_ban_level_'||p_level), auth.uid())
      ON CONFLICT (fingerprint) DO NOTHING;
  END IF;
  IF p_level >= 3 AND v_ip IS NOT NULL THEN
    INSERT INTO public.blocked_ips(ip, reason, created_by)
      VALUES (v_ip, COALESCE(p_reason,'admin_ban_level_'||p_level), auth.uid())
      ON CONFLICT (ip) DO NOTHING;
  END IF;

  INSERT INTO public.member_activity_log(user_id, action, detail, ip, fingerprint)
    VALUES (p_user, 'ban', 'Khóa mức ' || p_level || COALESCE(' — '||p_reason,''), v_ip, fp);

  RETURN jsonb_build_object('ok', true, 'level', p_level, 'fingerprint', fp, 'ip', v_ip);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_ban_member_level(uuid,int,text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unban_member_full(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_banned = false, banned_until = NULL WHERE id = p_user;
  DELETE FROM public.blocked_devices WHERE fingerprint IN (
    SELECT DISTINCT fingerprint FROM public.device_accounts WHERE user_id = p_user AND fingerprint IS NOT NULL);
  DELETE FROM public.blocked_ips WHERE ip IN (
    SELECT DISTINCT ip FROM public.device_accounts WHERE user_id = p_user AND ip IS NOT NULL);
  INSERT INTO public.member_activity_log(user_id, action, detail) VALUES (p_user, 'unban', 'Mở khóa toàn bộ');
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_unban_member_full(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 11) Nhật ký hoạt động của 1 thành viên
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_member_activity(p_user uuid, p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (id uuid, action text, detail text, ip text, fingerprint text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() AND auth.uid() <> p_user THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT l.id, l.action, l.detail, l.ip, l.fingerprint, l.created_at
      FROM public.member_activity_log l
     WHERE l.user_id = p_user
     ORDER BY l.created_at DESC
     LIMIT COALESCE(p_limit,50) OFFSET COALESCE(p_offset,0);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_member_activity(uuid,int,int) TO authenticated;

NOTIFY pgrst, 'reload schema';
