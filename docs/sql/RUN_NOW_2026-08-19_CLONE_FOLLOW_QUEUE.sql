-- =====================================================================
-- THEO DÕI THÀNH VIÊN — Hàng đợi Follow chạy 100% trong PostgreSQL
-- Chạy 1 lần trong Supabase SQL Editor của DB CHÍNH.
-- Yêu cầu: docs/sql/2026-07-05_follows_and_notifications_base.sql đã chạy.
--
-- Nguyên tắc:
--   • Admin chọn clone (nam / nữ / thủ công) + chọn user thật → sinh hàng đợi.
--   • pg_cron gọi public.clone_follow_tick() mỗi phút → đóng web vẫn chạy.
--   • Mỗi clone chỉ follow 1 user đúng 1 lần; đã follow rồi thì bỏ qua.
--   • Trigger follow hiện có tự bắn notification + badge realtime.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.clone_follow_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL,           -- clone
  target_id    uuid NOT NULL,           -- user thật
  run_at       timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','done','skipped','failed','cancelled')),
  error        text,
  finished_at  timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, target_id)
);
CREATE INDEX IF NOT EXISTS clone_follow_tasks_due_idx ON public.clone_follow_tasks (status, run_at);
ALTER TABLE public.clone_follow_tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.clone_follow_tasks TO service_role;

-- ---------------------------------------------------------------------
-- 1) Danh sách người dùng THẬT (không phải clone, không phải admin)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_follow_user_list(text, int);
CREATE FUNCTION public.admin_follow_user_list(p_q text DEFAULT NULL, p_limit int DEFAULT 500)
RETURNS TABLE (id uuid, username text, full_name text, avatar text, gender text,
               followers int, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar, p.gender,
         (SELECT count(*)::int FROM public.follows f WHERE f.following_id = p.id),
         p.created_at
    FROM public.profiles p
   WHERE coalesce(p.account_source,'') <> 'internal'
     AND coalesce(p.is_banned,false) = false
     AND (nullif(btrim(coalesce(p_q,'')),'') IS NULL
          OR p.username ILIKE '%'||btrim(p_q)||'%'
          OR coalesce(p.full_name,'') ILIKE '%'||btrim(p_q)||'%')
   ORDER BY p.created_at DESC
   LIMIT greatest(coalesce(p_limit,500),1);
END $fn$;

-- ---------------------------------------------------------------------
-- 2) Sinh hàng đợi Follow
--    p_per_user = số clone follow mỗi user (chia đều pool clone).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_clone_follow_apply(uuid[], uuid[], int, int, int);
CREATE FUNCTION public.admin_clone_follow_apply(
  p_clone_ids uuid[],
  p_user_ids  uuid[],
  p_per_user  int DEFAULT 10,
  p_delay_min int DEFAULT 0,
  p_delay_max int DEFAULT 60
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_pool uuid[]; n int; made int := 0; i int; k int; idx int := 0;
  v_user uuid; v_clone uuid; v_delay int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(p_user_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn user nào' USING ERRCODE='22023';
  END IF;

  SELECT coalesce(array_agg(p.id ORDER BY random()), '{}'::uuid[]) INTO v_pool
    FROM public.profiles p
   WHERE p.account_source = 'internal'
     AND coalesce(p.is_banned,false) = false
     AND (coalesce(array_length(p_clone_ids,1),0) = 0 OR p.id = ANY(p_clone_ids));

  n := coalesce(array_length(v_pool,1),0);
  IF n = 0 THEN RAISE EXCEPTION 'Không có clone nào' USING ERRCODE='22023'; END IF;

  FOREACH v_user IN ARRAY p_user_ids LOOP
    FOR k IN 1..least(greatest(coalesce(p_per_user,10),1), n) LOOP
      idx := idx + 1;
      v_clone := v_pool[1 + (idx % n)];
      CONTINUE WHEN v_clone = v_user;

      -- Đã follow rồi → bỏ qua
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.follows f
                             WHERE f.follower_id = v_clone AND f.following_id = v_user);

      v_delay := coalesce(p_delay_min,0)
               + floor(random() * greatest(coalesce(p_delay_max,60) - coalesce(p_delay_min,0), 0) + 1)::int;

      INSERT INTO public.clone_follow_tasks (follower_id, target_id, run_at, created_by)
      VALUES (v_clone, v_user, now() + make_interval(secs => v_delay * 60 / 60), auth.uid())
      ON CONFLICT (follower_id, target_id) DO NOTHING;

      IF FOUND THEN made := made + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN made;
END $fn$;

-- ---------------------------------------------------------------------
-- 3) Xem / xoá hàng đợi
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_clone_follow_tasks(int);
CREATE FUNCTION public.admin_clone_follow_tasks(p_limit int DEFAULT 500)
RETURNS TABLE (task_id uuid, follower_id uuid, follower_username text, follower_avatar text,
               target_id uuid, target_username text, target_avatar text,
               run_at timestamptz, status text, error text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id, t.follower_id, c.username, c.avatar,
         t.target_id, u.username, u.avatar,
         t.run_at, t.status, t.error
    FROM public.clone_follow_tasks t
    LEFT JOIN public.profiles c ON c.id = t.follower_id
    LEFT JOIN public.profiles u ON u.id = t.target_id
   ORDER BY t.created_at DESC, t.run_at
   LIMIT greatest(coalesce(p_limit,500),1);
END $fn$;

DROP FUNCTION IF EXISTS public.admin_clone_follow_clear();
CREATE FUNCTION public.admin_clone_follow_clear()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.clone_follow_tasks WHERE status = 'pending';
  GET DIAGNOSTICS v = ROW_COUNT; RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 4) Bộ chạy — pg_cron gọi mỗi phút
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clone_follow_tick(p_limit int DEFAULT 200)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; done int := 0;
BEGIN
  FOR r IN
    SELECT t.id, t.follower_id, t.target_id
      FROM public.clone_follow_tasks t
     WHERE t.status = 'pending' AND t.run_at <= now()
     ORDER BY t.run_at
     LIMIT greatest(coalesce(p_limit,200),1)
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      IF EXISTS (SELECT 1 FROM public.follows f
                  WHERE f.follower_id = r.follower_id AND f.following_id = r.target_id) THEN
        UPDATE public.clone_follow_tasks
           SET status='skipped', finished_at=now() WHERE id = r.id;
      ELSE
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (r.follower_id, r.target_id)
        ON CONFLICT (follower_id, following_id) DO NOTHING;

        UPDATE public.clone_follow_tasks
           SET status='done', finished_at=now(), error=NULL WHERE id = r.id;
        done := done + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.clone_follow_tasks
         SET status='failed', finished_at=now(), error=SQLERRM WHERE id = r.id;
    END;
  END LOOP;
  RETURN done;
END $fn$;

-- ---------------------------------------------------------------------
-- 5) Lịch chạy (pg_cron) + quyền
-- ---------------------------------------------------------------------
DO $c$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'clone_follow_tick';
    PERFORM cron.schedule('clone_follow_tick', '* * * * *',
                          $$SELECT public.clone_follow_tick(200);$$);
  END IF;
END $c$;

DO $g$
DECLARE f text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'admin_clone_follow%' OR p.proname = 'admin_follow_user_list')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $g$;

REVOKE ALL ON FUNCTION public.clone_follow_tick(int) FROM PUBLIC;

-- Realtime badge: đảm bảo bảng follows nằm trong publication
DO $r$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='follows') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $r$;
