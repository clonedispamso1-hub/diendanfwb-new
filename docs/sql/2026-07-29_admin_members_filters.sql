-- =====================================================================
-- ADMIN PANEL — QUẢN LÝ THÀNH VIÊN (dữ liệu thật, filter + phân trang server-side)
-- Idempotent. Chạy 1 lần trên DB production hiện tại (không đổi project).
--
-- Yêu cầu có sẵn (từ các migration trước):
--   profiles, device_registrations(user_id, fingerprint, ip, user_agent, created_at),
--   user_restrictions, public._is_current_admin()
--
-- Thêm:
--   profiles.last_seen (đảm bảo tồn tại) + index hiệu năng
--   admin_list_members     — list + filter + search + phân trang (server-side)
--   admin_device_directory — thống kê Fingerprint / IP (số tài khoản đã tạo)
--   admin_device_accounts  — danh sách tài khoản theo 1 IP hoặc 1 Fingerprint
-- =====================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- ---------- Indexes hiệu năng ---------------------------------------
CREATE INDEX IF NOT EXISTS profiles_created_at_idx   ON public.profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS profiles_last_seen_idx    ON public.profiles (last_seen DESC);
CREATE INDEX IF NOT EXISTS profiles_banned_until_idx ON public.profiles (banned_until);
CREATE INDEX IF NOT EXISTS profiles_is_banned_idx    ON public.profiles (is_banned);
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx     ON public.profiles (is_admin);
CREATE INDEX IF NOT EXISTS devreg_fingerprint_idx    ON public.device_registrations (fingerprint);
CREATE INDEX IF NOT EXISTS devreg_ip_idx             ON public.device_registrations (ip);
CREATE INDEX IF NOT EXISTS devreg_user_idx           ON public.device_registrations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_restrictions_user_idx ON public.user_restrictions (user_id);

-- ---------- Danh sách thành viên (server-side filter + paging) ------
-- p_status: 'all' | 'admin' | 'user' | 'active' | 'banned' | 'violation'
--   active    = đã truy cập trong hôm nay (last_seen >= đầu ngày hôm nay, giờ VN)
--   violation = chỉ tài khoản có vi phạm (user_restrictions)
-- p_from / p_to: lọc theo created_at ("tài khoản mới") — tính sẵn ở client.
CREATE OR REPLACE FUNCTION public.admin_list_members(
  p_q        text          DEFAULT NULL,
  p_status   text          DEFAULT 'all',
  p_from     timestamptz   DEFAULT NULL,
  p_to       timestamptz   DEFAULT NULL,
  p_limit    int           DEFAULT 50,
  p_offset   int           DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  public_id text,
  full_name text,
  username text,
  avatar text,
  phone text,
  created_at timestamptz,
  last_seen timestamptz,
  is_online boolean,
  is_admin boolean,
  is_banned boolean,
  banned_until timestamptz,
  role text,
  followers_count int,
  posts_count bigint,
  following_count bigint,
  violation_count bigint,
  fingerprint text,
  ip text,
  user_agent text,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                                 AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_q text := NULLIF(btrim(COALESCE(p_q, '')), '');
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.*
      FROM public.profiles p
     WHERE (v_q IS NULL
            OR p.username  ILIKE '%' || v_q || '%'
            OR p.full_name ILIKE '%' || v_q || '%'
            OR p.public_id ILIKE '%' || v_q || '%'
            OR p.phone     ILIKE '%' || v_q || '%'
            OR p.id::text = v_q)
       AND (p_from IS NULL OR p.created_at >= p_from)
       AND (p_to   IS NULL OR p.created_at <= p_to)
       AND (
            p_status = 'all'
         OR (p_status = 'admin'  AND COALESCE(p.is_admin, false))
         OR (p_status = 'user'   AND NOT COALESCE(p.is_admin, false))
         OR (p_status = 'banned' AND COALESCE(p.is_banned, false))
         OR (p_status = 'active' AND p.last_seen >= v_today_start)
         OR (p_status = 'violation'
             AND EXISTS (SELECT 1 FROM public.user_restrictions r WHERE r.user_id = p.id))
       )
  ),
  counted AS (SELECT count(*)::bigint AS n FROM base),
  page AS (
    SELECT b.* FROM base b
     ORDER BY CASE WHEN p_status = 'active' THEN b.last_seen END DESC NULLS LAST,
              b.created_at DESC
     LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT
    pg.id, pg.public_id, pg.full_name, pg.username, pg.avatar, pg.phone,
    pg.created_at, pg.last_seen, pg.is_online, pg.is_admin, pg.is_banned,
    pg.banned_until, pg.role, COALESCE(pg.followers_count, 0)::int,
    COALESCE((SELECT count(*) FROM public.posts po   WHERE po.user_id = pg.id), 0),
    COALESCE((SELECT count(*) FROM public.follows f  WHERE f.follower_id = pg.id), 0),
    COALESCE((SELECT count(*) FROM public.user_restrictions r WHERE r.user_id = pg.id), 0),
    d.fingerprint, d.ip, d.user_agent,
    (SELECT n FROM counted)
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT dr.fingerprint, dr.ip, dr.user_agent
      FROM public.device_registrations dr
     WHERE dr.user_id = pg.id
     ORDER BY dr.created_at DESC
     LIMIT 1
  ) d ON true
  ORDER BY CASE WHEN p_status = 'active' THEN pg.last_seen END DESC NULLS LAST,
           pg.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_members(text, text, timestamptz, timestamptz, int, int) TO authenticated;

-- ---------- Địa chỉ máy: thống kê fingerprint / IP -------------------
-- p_group: 'fingerprint' | 'ip'
CREATE OR REPLACE FUNCTION public.admin_device_directory(
  p_group  text DEFAULT 'fingerprint',
  p_q      text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
)
RETURNS TABLE(
  key_value text,
  accounts_count bigint,
  registrations_count bigint,
  last_user_agent text,
  last_ip text,
  last_fingerprint text,
  last_seen_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text := NULLIF(btrim(COALESCE(p_q, '')), '');
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;

  RETURN QUERY
  WITH src AS (
    SELECT
      CASE WHEN p_group = 'ip' THEN dr.ip ELSE dr.fingerprint END AS k,
      dr.*
      FROM public.device_registrations dr
  ),
  grouped AS (
    SELECT
      s.k AS key_value,
      count(DISTINCT s.user_id)::bigint AS accounts_count,
      count(*)::bigint AS registrations_count,
      (array_agg(s.user_agent  ORDER BY s.created_at DESC))[1] AS last_user_agent,
      (array_agg(s.ip          ORDER BY s.created_at DESC))[1] AS last_ip,
      (array_agg(s.fingerprint ORDER BY s.created_at DESC))[1] AS last_fingerprint,
      max(s.created_at) AS last_seen_at
      FROM src s
     WHERE s.k IS NOT NULL AND btrim(s.k) <> ''
       AND (v_q IS NULL OR s.k ILIKE '%' || v_q || '%')
     GROUP BY s.k
  ),
  counted AS (SELECT count(*)::bigint AS n FROM grouped)
  SELECT g.key_value, g.accounts_count, g.registrations_count,
         g.last_user_agent, g.last_ip, g.last_fingerprint, g.last_seen_at,
         (SELECT n FROM counted)
    FROM grouped g
   ORDER BY g.accounts_count DESC, g.last_seen_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_device_directory(text, text, int, int) TO authenticated;

-- ---------- Danh sách tài khoản theo 1 IP / 1 Fingerprint ------------
CREATE OR REPLACE FUNCTION public.admin_device_accounts(
  p_group text,
  p_value text
)
RETURNS TABLE(
  id uuid,
  public_id text,
  username text,
  full_name text,
  phone text,
  created_at timestamptz,
  last_seen timestamptz,
  is_banned boolean,
  is_admin boolean,
  first_seen_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;

  RETURN QUERY
  SELECT p.id, p.public_id, p.username, p.full_name, p.phone,
         p.created_at, p.last_seen, COALESCE(p.is_banned, false), COALESCE(p.is_admin, false),
         min(dr.created_at)
    FROM public.device_registrations dr
    JOIN public.profiles p ON p.id = dr.user_id
   WHERE (p_group = 'ip'          AND dr.ip = p_value)
      OR (p_group = 'fingerprint' AND dr.fingerprint = p_value)
   GROUP BY p.id, p.public_id, p.username, p.full_name, p.phone,
            p.created_at, p.last_seen, p.is_banned, p.is_admin
   ORDER BY min(dr.created_at) DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_device_accounts(text, text) TO authenticated;
