-- ============================================================================
-- XÓA HỆ THỐNG "TẶNG QUÀ BÀI VIẾT" — Supabase #1 (core: posts / post_gifts)
-- Chủ sở hữu đã xác nhận toàn bộ quà bài viết đã xử lý xong, không giữ lịch sử.
-- CHỈ xóa object riêng Post Gift. KHÔNG đụng: gem_transactions, gem_balance,
-- transfer_transactions, red_packets (Lì Xì), message gifts, video_gifts,
-- notifications, user restrictions.
-- Không dùng CASCADE: nếu object dùng chung phụ thuộc post_gifts → migration DỪNG.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'post_gifts') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.post_gifts';
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'send_post_gift','send_post_gift_v2','claim_post_gift','claim_post_gift_v2',
      'claim_all_post_gifts_v2','gift_gem_to_post','gift_gem_to_post_v2','gift_gem_to_post_v3',
      'gift_candy_to_post','post_gift_senders','claim_dragon_ball_gift')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- Tự xóa theo: index, constraint, RLS policy, trigger gắn trên bảng
DROP TABLE IF EXISTS public.post_gifts;
DROP FUNCTION IF EXISTS public.post_gifts_block_when_locked();

COMMIT;
