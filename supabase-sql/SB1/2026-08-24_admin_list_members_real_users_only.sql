-- =====================================================================
-- SUPABASE #1 — QUẢN LÝ THÀNH VIÊN: CHỈ TÀI KHOẢN NGƯỜI DÙNG THẬT
--
-- CHƯA CHẠY. Chỉ CREATE OR REPLACE FUNCTION (giữ NGUYÊN tên + signature +
-- danh sách cột trả về mà frontend đang gọi). Không tạo bảng, không xoá
-- dữ liệu, không đổi RLS, không đổi URL/API key.
--
-- Thay đổi duy nhất: loại trừ ngay từ BACKEND các tài khoản không phải
-- người dùng thật:
--   • clone / internal account  (profiles.account_source = 'internal',
--                                profiles.is_clone = true)
--   • seed account              (profiles.is_seed_account = true)
--   • tài khoản ảo / bot        (profiles.is_virtual = true, username
--                                dạng bangchu*/chatdel-*, email nội bộ)
-- Áp dụng cho MỌI p_status (kể cả tab 'admin' và 'user').
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_list_members(
  p_q        text        DEFAULT NULL,
  p_status   text        DEFAULT 'all',
  p_from     timestamptz DEFAULT NULL,
  p_to       timestamptz DEFAULT NULL,
  p_limit    int         DEFAULT 50,
  p_offset   int         DEFAULT 0
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
     WHERE
       -- ==== CHỈ NGƯỜI DÙNG THẬT ====
           COALESCE(p.account_source, '') <> 'internal'
       AND COALESCE(p.is_clone, false)        = false
       AND COALESCE(p.is_seed_account, false) = false
       AND COALESCE(p.is_virtual, false)      = false
       AND COALESCE(p.username, '') !~* '^(bangchu[0-9]*|chatdel[-_].*)$'
       AND COALESCE(p.email, '')    !~* '@admin\.candy\.local$'
       -- ==== BỘ LỌC TÌM KIẾM ====
       AND (v_q IS NULL
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
    0::bigint AS posts_count,        -- posts nằm ở Supabase #3 (frontend đếm thật)
    0::bigint AS following_count,    -- follows nằm ở Supabase #3
    COALESCE((SELECT count(*) FROM public.user_restrictions r WHERE r.user_id = pg.id), 0)::bigint,
    NULL::text AS fingerprint,
    NULL::text AS ip,
    NULL::text AS user_agent,
    (SELECT n FROM counted)
  FROM page pg
  ORDER BY CASE WHEN p_status = 'active' THEN pg.last_seen END DESC NULLS LAST,
           pg.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_members(text, text, timestamptz, timestamptz, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_members(text, text, timestamptz, timestamptz, int, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
