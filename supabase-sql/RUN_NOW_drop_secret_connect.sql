-- =====================================================================
-- XOÁ HOÀN TOÀN MODULE "KẾT NỐI BÍ MẬT" khỏi database.
-- Idempotent: chạy lại nhiều lần vẫn OK.
-- KHÔNG đụng: Feed, Chat, Wallet, Auth, Notification, Feedback.
-- =====================================================================

-- Functions / RPC
DROP FUNCTION IF EXISTS public.secret_connect_bump_usage(uuid)            CASCADE;
DROP FUNCTION IF EXISTS public.secret_connect_bump_usage()                CASCADE;
DROP FUNCTION IF EXISTS public.secret_connect_release_week()              CASCADE;
DROP FUNCTION IF EXISTS public.secret_connect_shuffle_pool()              CASCADE;
DROP FUNCTION IF EXISTS public.secret_connect_weekly_reset()              CASCADE;

-- Xoá mọi function còn sót có tiền tố secret_connect_
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'secret_connect%'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- Views
DROP VIEW IF EXISTS public.secret_connect_pool_view CASCADE;

-- Tables (policy + trigger + index bị xoá theo CASCADE)
DROP TABLE IF EXISTS public.secret_connect_clone_uses  CASCADE;
DROP TABLE IF EXISTS public.secret_connect_clones      CASCADE;
DROP TABLE IF EXISTS public.secret_connect_usage       CASCADE;
DROP TABLE IF EXISTS public.secret_connect_logs        CASCADE;
DROP TABLE IF EXISTS public.secret_connect_accounts    CASCADE;
DROP TABLE IF EXISTS public.secret_connect_settings    CASCADE;
