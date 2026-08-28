-- Fix lỗi 42703 khi gửi/nhận quà trên schema hiện tại.
-- user_restrictions không có revoked_at; gỡ hạn chế bằng cách DELETE dòng.
-- Chạy trên DB chính (SB1), nơi chứa ví/quà và send_post_gift_v2.

CREATE OR REPLACE FUNCTION public.has_active_restriction(_user uuid, _kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_restrictions
    WHERE user_id = _user
      AND kind IN ('suspend', _kind)
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_restriction(uuid, text)
  TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.enforce_restriction(_kind text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
  v_reason text;
  v_expires_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT kind, reason, expires_at
    INTO v_kind, v_reason, v_expires_at
  FROM public.user_restrictions
  WHERE user_id = v_uid
    AND kind IN ('suspend', _kind)
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY (kind = 'suspend') DESC, created_at DESC
  LIMIT 1;

  IF v_kind IS NOT NULL THEN
    RAISE EXCEPTION 'RESTRICTED:%:%:%',
      v_kind,
      COALESCE(v_reason, ''),
      COALESCE(
        to_char(v_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'permanent'
      )
      USING ERRCODE = '42501';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enforce_restriction(text)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';