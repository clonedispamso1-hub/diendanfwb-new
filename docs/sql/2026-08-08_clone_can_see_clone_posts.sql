-- =====================================================================
-- CLONE ↔ CLONE INTERACTION
-- Admin Panel → Bình luận hàng loạt phải thấy CẢ bài của User thật
-- lẫn bài của Clone (account_source = 'internal'), để Clone bình luận
-- qua lại với nhau.
--
-- Thêm tham số p_include_clones (mặc định TRUE). Frontend gọi bản mới,
-- nếu DB chưa chạy script này thì tự fallback về bản cũ.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_internal_real_posts(
  p_search text DEFAULT NULL,
  p_since  timestamptz DEFAULT NULL,
  p_limit  int DEFAULT 200,
  p_include_clones boolean DEFAULT true
) RETURNS TABLE (
  id uuid, content text, created_at timestamptz,
  author_id uuid, author_username text, author_name text, author_avatar text,
  comments_count bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text := nullif(btrim(coalesce(p_search,'')),'');
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT po.id, po.content, po.created_at,
         pr.id, pr.username, pr.full_name, pr.avatar,
         (SELECT count(*) FROM public.comments c WHERE c.post_id = po.id)::bigint
    FROM public.posts po
    JOIN public.profiles pr ON pr.id = po.user_id
   WHERE coalesce(pr.is_admin,false) = false
     AND (
       coalesce(pr.account_source,'') <> 'internal'
       OR coalesce(p_include_clones, true) = true
     )
     AND (p_since IS NULL OR po.created_at >= p_since)
     AND (v_q IS NULL
          OR coalesce(po.content,'') ILIKE '%'||v_q||'%'
          OR pr.username ILIKE '%'||v_q||'%'
          OR coalesce(pr.full_name,'') ILIKE '%'||v_q||'%')
   ORDER BY po.created_at DESC
   LIMIT greatest(coalesce(p_limit,200),1);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_internal_real_posts(text,timestamptz,int,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_real_posts(text,timestamptz,int,boolean) TO authenticated;
