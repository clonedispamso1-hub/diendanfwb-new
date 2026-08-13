-- =====================================================================
-- ADMIN PANEL V5.1 — Tặng quà NGẪU NHIÊN cho người dùng thật
-- Chạy 1 lần trong Supabase SQL Editor của DB HIỆN TẠI.
-- KHÔNG đổi URL / API key, KHÔNG tạo project mới.
-- Chỉ THÊM 2 RPC đọc dữ liệu — RPC tặng quà cũ
-- public.admin_internal_gift_post giữ nguyên => Bulk Gift hiện tại an toàn.
-- =====================================================================

-- 1) Random người nhận: chỉ user THẬT (loại Admin / clone / ảo / bị khóa)
DROP FUNCTION IF EXISTS public.admin_gift_random_users(int);
CREATE OR REPLACE FUNCTION public.admin_gift_random_users(p_limit int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  avatar text,
  post_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT 1 FROM public.profiles a WHERE a.id = auth.uid() AND a.is_admin = true
  ),
  eligible AS (
    SELECT pr.id,
           pr.username,
           pr.full_name,
           COALESCE((to_jsonb(pr) ->> 'avatar'), (to_jsonb(pr) ->> 'avatar_url')) AS avatar
      FROM public.profiles pr
     WHERE EXISTS (SELECT 1 FROM me)
       AND COALESCE(pr.is_admin, false) = false
       AND COALESCE(pr.is_banned, false) = false
       AND COALESCE((to_jsonb(pr) ->> 'banned_until')::timestamptz < now(), true)
       AND COALESCE(((to_jsonb(pr) ->> 'is_virtual'))::boolean, false) = false
       AND COALESCE(((to_jsonb(pr) ->> 'is_clone'))::boolean, false) = false
       AND COALESCE(((to_jsonb(pr) ->> 'is_seed_account'))::boolean, false) = false
       AND COALESCE(((to_jsonb(pr) ->> 'is_locked'))::boolean, false) = false
       AND COALESCE(((to_jsonb(pr) ->> 'is_disabled'))::boolean, false) = false
       AND COALESCE(((to_jsonb(pr) ->> 'is_deleted'))::boolean, false) = false
  )
  SELECT e.id, e.username, e.full_name, e.avatar, COUNT(po.id) AS post_count
    FROM eligible e
    JOIN public.posts po ON po.user_id = e.id
   GROUP BY e.id, e.username, e.full_name, e.avatar
  HAVING COUNT(po.id) > 0
   ORDER BY random()
   LIMIT GREATEST(COALESCE(p_limit, 10), 1);
$$;

REVOKE ALL ON FUNCTION public.admin_gift_random_users(int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_gift_random_users(int) TO authenticated;

-- 2) Bài viết mới nhất của user THẬT (tùy chọn: chỉ trong danh sách user)
DROP FUNCTION IF EXISTS public.admin_gift_recent_posts(int, uuid[]);
CREATE OR REPLACE FUNCTION public.admin_gift_recent_posts(
  p_limit int DEFAULT 50,
  p_users uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  created_at timestamptz,
  author_name text,
  author_username text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT po.id, po.user_id, LEFT(COALESCE(po.content, ''), 160), po.created_at,
         pr.full_name, pr.username
    FROM public.posts po
    JOIN public.profiles pr ON pr.id = po.user_id
   WHERE EXISTS (SELECT 1 FROM public.profiles a WHERE a.id = auth.uid() AND a.is_admin = true)
     AND (p_users IS NULL OR po.user_id = ANY (p_users))
     AND COALESCE(pr.is_admin, false) = false
     AND COALESCE(pr.is_banned, false) = false
     AND COALESCE(((to_jsonb(pr) ->> 'is_virtual'))::boolean, false) = false
     AND COALESCE(((to_jsonb(pr) ->> 'is_clone'))::boolean, false) = false
     AND COALESCE(((to_jsonb(pr) ->> 'is_seed_account'))::boolean, false) = false
   ORDER BY po.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

REVOKE ALL ON FUNCTION public.admin_gift_recent_posts(int, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_gift_recent_posts(int, uuid[]) TO authenticated;
