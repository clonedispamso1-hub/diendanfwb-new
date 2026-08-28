-- =====================================================================
-- PATCH (Supabase #1) — admin_internal_real_users chỉ trả USER THẬT.
-- Chạy trên DB hiện tại (KHÔNG tạo DB mới). Idempotent.
--
-- Loại bỏ:
--   account_source = 'internal'
--   is_internal    = true
--   is_clone       = true
--   is_virtual     = true
--   is_seed_account= true
-- Giữ ORDER BY created_at DESC.
--
-- Lưu ý: bản cũ dùng NOT (a OR b OR ...) nên khi cột là NULL thì cả biểu thức
-- thành NULL và user thật bị lọc mất → nay dùng COALESCE(...) = false.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_internal_real_users(
  p_search text DEFAULT NULL,
  p_since  timestamptz DEFAULT NULL,
  p_limit  int DEFAULT 1000
)
RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, public_id text,
  gender text, province text, is_online boolean, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, COALESCE(p.avatar, p.avatar_url), p.public_id,
         p.gender, p.province, p.is_online, p.created_at
    FROM public.profiles p
   WHERE COALESCE(p.account_source, '') <> 'internal'
     AND COALESCE(p.is_internal, false) = false
     AND COALESCE(p.is_clone, false) = false
     AND COALESCE(p.is_virtual, false) = false
     AND COALESCE(p.is_seed_account, false) = false
     AND (p_since IS NULL OR p.created_at >= p_since)
     AND (p_search IS NULL OR btrim(p_search) = ''
          OR p.username ILIKE '%' || p_search || '%'
          OR COALESCE(p.full_name, '') ILIKE '%' || p_search || '%'
          OR COALESCE(p.public_id, '') ILIKE '%' || p_search || '%')
   ORDER BY p.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 1000), 1);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_internal_real_users(text, timestamptz, int)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
