-- =====================================================================
-- CHỈ CHẠY FILE NÀY TRÊN SUPABASE #1 (CORE/AUTH/PROFILES)
-- RPC bảo mật để Bang Chủ admin_1 gán Media VIP cho tài khoản clone.
-- Không tạo hoặc nới bất kỳ UPDATE policy nào trên public.profiles.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_clone_vip_media(
  p_ids uuid[],
  p_media jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  v_count integer := 0;
  v_media jsonb := COALESCE(p_media, '[]'::jsonb);
  v_first text;
  v_second text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Chỉ đúng Bang Chủ admin_1, đã duyệt và đang hoạt động.
  IF NOT EXISTS (
    SELECT 1
      FROM public.bangchu AS b
     WHERE b.auth_user_id = auth.uid()
       AND b.role::text = 'admin_1'
       AND b.status::text = 'approved'
       AND b.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Forbidden: active approved admin_1 required'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_media) <> 'array' OR jsonb_array_length(v_media) > 2 THEN
    RAISE EXCEPTION 'p_media must be a JSON array with at most 2 URLs'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_media) AS item(value)
     WHERE jsonb_typeof(item.value) <> 'string'
        OR length(btrim(item.value #>> '{}')) > 2048
        OR btrim(item.value #>> '{}') !~ '^https://'
  ) THEN
    RAISE EXCEPTION 'Every Media VIP item must be an HTTPS URL up to 2048 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT requested_id), '{}'::uuid[])
    INTO v_ids
    FROM unnest(COALESCE(p_ids, '{}'::uuid[])) AS requested(requested_id);

  IF cardinality(v_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(v_ids) > 500 THEN
    RAISE EXCEPTION 'At most 500 clone profiles can be updated per call'
      USING ERRCODE = '22023';
  END IF;

  -- Fail toàn bộ request nếu có ID không tồn tại hoặc không phải tài khoản thứ hai/clone.
  IF EXISTS (
    SELECT 1
      FROM unnest(v_ids) AS requested(id)
      LEFT JOIN public.profiles AS p ON p.id = requested.id
     WHERE p.id IS NULL
        OR NOT (
          COALESCE(p.is_clone, false)
          OR COALESCE(p.is_virtual, false)
          OR COALESCE(p.is_internal, false)
          OR COALESCE(p.is_seed_account, false)
          OR COALESCE(p.account_source, '') = 'internal'
        )
  ) THEN
    RAISE EXCEPTION 'Target must contain only second-account/clone profiles'
      USING ERRCODE = '42501';
  END IF;

  v_first := NULLIF(btrim(v_media ->> 0), '');
  v_second := NULLIF(btrim(v_media ->> 1), '');

  -- Cố ý chỉ cập nhật đúng 3 cột Media VIP được phép.
  UPDATE public.profiles AS p
     SET vip_media = v_media,
         title_gif_url = v_first,
         profile_gif = v_second
   WHERE p.id = ANY(v_ids)
     AND (
       COALESCE(p.is_clone, false)
       OR COALESCE(p.is_virtual, false)
       OR COALESCE(p.is_internal, false)
       OR COALESCE(p.is_seed_account, false)
       OR COALESCE(p.account_source, '') = 'internal'
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_clone_vip_media(uuid[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_clone_vip_media(uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_clone_vip_media(uuid[], jsonb) TO authenticated;

COMMIT;