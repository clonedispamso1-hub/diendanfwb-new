-- RPC: nearby_scan_more
-- Trừ 10.000 Xu (gem_balance) khi user bấm "Quét thêm" ở tab Kết Nối.
-- Bypass trigger `profiles_block_gem_balance_client` bằng flag app.allow_gem_change.
-- Idempotent — chạy lại nhiều lần vẫn an toàn.
--
-- Cách chạy: mở Supabase SQL Editor → paste file này → Run.

CREATE OR REPLACE FUNCTION public.nearby_scan_more(p_cost bigint DEFAULT 10000)
RETURNS TABLE (new_balance bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bal bigint;
  v_new bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_cost' USING ERRCODE = 'P0001';
  END IF;

  -- Bật flag để trigger cho phép sửa gem_balance trong RPC này.
  PERFORM set_config('app.allow_gem_change', '1', true);

  SELECT gem_balance INTO v_bal
    FROM public.profiles
   WHERE id = v_uid
   FOR UPDATE;

  IF v_bal IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_bal < p_cost THEN
    RAISE EXCEPTION 'insufficient_balance' USING ERRCODE = 'P0001';
  END IF;

  v_new := v_bal - p_cost;

  UPDATE public.profiles
     SET gem_balance = v_new
   WHERE id = v_uid;

  new_balance := v_new;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.nearby_scan_more(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nearby_scan_more(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.nearby_scan_more(bigint) TO authenticated;
