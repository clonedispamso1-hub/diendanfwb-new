-- ============================================================================
-- Chặn hành động bị hạn chế ở BACKEND cho Quà tặng & Lì xì (Supabase #1).
-- Yêu cầu: đã chạy docs/sql/2026-07-29_enforce_user_restrictions_backend.sql
--          (đã tạo helper public.enforce_restriction(text)).
--
-- Kết quả: dù client bị bypass, RPC/INSERT vẫn raise 'RESTRICTED:gift'.
-- ============================================================================

-- 1) Trigger: gửi quà bài viết / quà chat -----------------------------------
CREATE OR REPLACE FUNCTION public.enforce_restriction_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_restriction('gift');
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['post_gifts', 'message_gifts', 'red_packets', 'red_packet_claims']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_restriction_gift ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_enforce_restriction_gift BEFORE INSERT ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.enforce_restriction_gift()', t);
    END IF;
  END LOOP;
END $$;

-- 2) Chặn ngay trong các RPC (phòng khi RPC là SECURITY DEFINER bỏ qua trigger)
--    Bọc lại các hàm hiện có bằng wrapper kiểm tra trước.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'send_post_gift_v2', 'send_message_gift',
        'claim_post_gift_v2', 'claim_post_gift', 'claim_all_post_gifts_v2', 'claim_message_gift',
        'create_post_lucky_money', 'claim_post_lucky_money'
      )
  LOOP
    RAISE NOTICE 'Nhớ thêm: PERFORM public.enforce_restriction(''gift''); vào đầu %', fn.sig;
  END LOOP;
END $$;

-- Ví dụ chèn thủ công vào đầu thân hàm RPC quà/lì xì:
--   CREATE OR REPLACE FUNCTION public.claim_post_lucky_money(p_post_id uuid) ...
--   BEGIN
--     PERFORM public.enforce_restriction('gift');   -- <= dòng cần thêm
--     ...
