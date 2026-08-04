-- ===================================================================
-- Second Account: bổ sung "Số tiền / Kẹo" (gem_balance) vào panel admin
-- Chạy 1 lần trong Supabase SQL editor. An toàn, không xoá dữ liệu.
-- ===================================================================

-- 1) Mở rộng danh sách: trả thêm cột gem_balance
DROP FUNCTION IF EXISTS public.admin_list_internal_accounts(text,int,int,text);
CREATE OR REPLACE FUNCTION public.admin_list_internal_accounts(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0,
  p_gender text DEFAULT NULL
) RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, bio text,
  province text, gender text, is_banned boolean, created_at timestamptz,
  followers bigint, following bigint, posts bigint, messages bigint, unread bigint,
  gem_balance bigint,
  total bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_term text := nullif(trim(coalesce(p_search,'')), '');
  v_gender text := nullif(trim(coalesce(p_gender,'')), '');
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF v_gender NOT IN ('male','female') THEN v_gender := NULL; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.username, p.full_name, p.avatar, p.bio, p.province, p.gender,
           p.is_banned, p.created_at,
           coalesce(p.followers_count,0)::bigint AS followers_col,
           coalesce(p.gem_balance,0)::bigint     AS gem_col
      FROM public.profiles p
     WHERE p.account_source = 'internal'
       AND (v_gender IS NULL OR p.gender = v_gender)
       AND (v_term IS NULL
            OR p.username ILIKE '%'||v_term||'%'
            OR p.full_name ILIKE '%'||v_term||'%'
            OR p.province  ILIKE '%'||v_term||'%'
            OR p.id::text  ILIKE '%'||v_term||'%')
  ), c AS (SELECT count(*)::bigint AS n FROM base)
  SELECT b.id, b.username, b.full_name, b.avatar, b.bio, b.province, b.gender,
         b.is_banned, b.created_at,
         greatest(b.followers_col,(SELECT count(*) FROM public.follows f WHERE f.following_id=b.id))::bigint,
         (SELECT count(*) FROM public.follows f2 WHERE f2.follower_id=b.id)::bigint,
         (SELECT count(*) FROM public.posts po WHERE po.user_id=b.id)::bigint,
         (SELECT count(*) FROM public.messages m WHERE m.sender_id=b.id OR m.receiver_id=b.id)::bigint,
         (SELECT count(*) FROM public.messages m2 WHERE m2.receiver_id=b.id AND coalesce(m2.is_read,false)=false)::bigint,
         b.gem_col,
         (SELECT n FROM c)
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT greatest(p_limit,1) OFFSET greatest(p_offset,0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_internal_accounts(text,int,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_internal_accounts(text,int,int,text) TO authenticated;

-- 2) RPC set Kẹo cho một tài khoản thứ hai
CREATE OR REPLACE FUNCTION public.admin_set_internal_account_gem(
  p_id uuid,
  p_gem bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=p_id AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản' USING ERRCODE='P0002';
  END IF;
  UPDATE public.profiles
     SET gem_balance = greatest(coalesce(p_gem,0),0)::int
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_internal_account_gem(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_internal_account_gem(uuid,bigint) TO authenticated;
