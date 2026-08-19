-- =====================================================================
-- RUN_NOW_2026-08-19_BOT_STRICT_LIFECYCLE.sql
-- Mục tiêu:
--   1) Giới hạn CỨNG mỗi lượt chạy tối đa 10 việc (p_limit DEFAULT 10,
--      luôn LEAST(p_limit, 10)) cho:
--        • public.scheduler_run_due(int)
--        • public.scenario_comment_tick(int)
--        • public.clone_follow_tick(int)
--   2) Vòng đời Online/Offline chuẩn cho clone (account_source = 'internal'):
--        • Ngay TRƯỚC batch: bulk UPDATE is_online = true cho đúng các clone
--          nằm trong batch.
--        • Ngay SAU batch (kể cả khi lỗi): bulk UPDATE is_online = false,
--          last_seen = now().
--   3) Dọn dẹp ban đầu: ép TẤT CẢ clone internal về is_online = false.
--   4) Cập nhật lịch pg_cron để gọi các hàm với limit = 10.
--
-- Cách chạy: dán toàn bộ file này vào Supabase → SQL Editor → Run.
-- An toàn khi chạy lại nhiều lần (idempotent).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) DỌN DẸP BAN ĐẦU: mọi clone internal về offline
-- ---------------------------------------------------------------------
UPDATE public.profiles
   SET is_online = false,
       last_seen = COALESCE(last_seen, now())
 WHERE account_source = 'internal'
   AND COALESCE(is_online, false) = true;

-- ---------------------------------------------------------------------
-- 1) scenario_comment_tick(p_limit int DEFAULT 10) — cap cứng 10
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_comment_tick(p_limit int DEFAULT 10)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r record;
  v_id uuid;
  done int := 0;
  v_limit int := GREATEST(LEAST(COALESCE(p_limit, 10), 10), 1);   -- HARD CAP 10
  v_actors uuid[] := ARRAY[]::uuid[];
BEGIN
  -- a) MAP slot ảo → scheduled_tasks thật khi job đã sinh task
  WITH slots AS (
    SELECT t.id, t.job_id, t.account_id,
           row_number() OVER (PARTITION BY t.job_id ORDER BY t.run_at, t.created_at) AS idx
      FROM public.scheduled_tasks t
     WHERE t.status <> 'cancelled'
  )
  UPDATE public.scenario_comment_tasks c
     SET post_task_id = s.id,
         author_id    = coalesce(c.author_id, s.account_id)
    FROM slots s
   WHERE c.post_task_id IS NULL
     AND c.status = 'waiting'
     AND s.job_id = c.job_id
     AND s.idx    = c.slot_index;

  -- a2) Clone comment trùng chủ bài → đổi sang clone khác
  UPDATE public.scenario_comment_tasks c
     SET account_id = alt.id
    FROM public.scheduled_tasks t,
         LATERAL (SELECT p.id FROM public.profiles p
                   WHERE p.account_source='internal' AND coalesce(p.is_banned,false)=false
                     AND p.id <> t.account_id
                   ORDER BY random() LIMIT 1) alt
   WHERE t.id = c.post_task_id
     AND c.status = 'waiting'
     AND c.account_id = t.account_id
     AND alt.id IS NOT NULL;

  -- b) Bài gốc đã đăng xong → giờ comment = giờ đăng + delay
  UPDATE public.scenario_comment_tasks c
     SET post_id = t.result_id,
         run_at  = coalesce(t.finished_at, now()) + make_interval(secs => c.delay_seconds),
         status  = 'pending'
    FROM public.scheduled_tasks t
   WHERE t.id = c.post_task_id
     AND c.status = 'waiting'
     AND t.status = 'done'
     AND t.result_id IS NOT NULL;

  -- c) Bài gốc hỏng / bị huỷ → comment huỷ theo
  UPDATE public.scenario_comment_tasks c
     SET status = 'cancelled', finished_at = now(),
         error  = coalesce(c.error, 'Bài gốc không đăng được')
    FROM public.scheduled_tasks t
   WHERE t.id = c.post_task_id
     AND c.status IN ('waiting','pending')
     AND t.status IN ('failed','cancelled');

  -- d) Job bị huỷ / lỗi → comment huỷ theo
  UPDATE public.scenario_comment_tasks c
     SET status = 'cancelled', finished_at = now()
    FROM public.scheduled_jobs j
   WHERE j.id = c.job_id AND c.status IN ('waiting','pending')
     AND j.status IN ('cancelled','failed');

  -- e) Chốt batch (tối đa 10) + BẬT ONLINE trước khi chạy
  CREATE TEMP TABLE IF NOT EXISTS _cmt_batch (id uuid, post_id uuid, account_id uuid, content text)
    ON COMMIT DROP;
  DELETE FROM _cmt_batch;

  INSERT INTO _cmt_batch (id, post_id, account_id, content)
  SELECT c.id, c.post_id, c.account_id, c.content
    FROM public.scenario_comment_tasks c
    JOIN public.scheduled_jobs j ON j.id = c.job_id
   WHERE c.status = 'pending' AND c.run_at <= now()
     AND c.post_id IS NOT NULL
     AND j.status IN ('pending','running')
   ORDER BY c.run_at
   LIMIT v_limit;

  SELECT COALESCE(array_agg(DISTINCT account_id), ARRAY[]::uuid[])
    INTO v_actors FROM _cmt_batch;

  IF COALESCE(array_length(v_actors, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- ONLINE ngay trước batch
  UPDATE public.profiles
     SET is_online = true
   WHERE id = ANY(v_actors);

  BEGIN
    FOR r IN SELECT * FROM _cmt_batch LOOP
      BEGIN
        INSERT INTO public.comments (post_id, user_id, content)
        VALUES (r.post_id, r.account_id, r.content)
        RETURNING id INTO v_id;

        UPDATE public.scenario_comment_tasks
           SET status='done', finished_at=now(), result_id=v_id, error=NULL
         WHERE id = r.id;
        done := done + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.scenario_comment_tasks
           SET status='failed', finished_at=now(), error=SQLERRM
         WHERE id = r.id;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- OFFLINE cả khi batch lỗi
    UPDATE public.profiles
       SET is_online = false, last_seen = now()
     WHERE id = ANY(v_actors);
    RAISE;
  END;

  -- OFFLINE ngay sau batch
  UPDATE public.profiles
     SET is_online = false, last_seen = now()
   WHERE id = ANY(v_actors);

  RETURN done;
END $fn$;

-- ---------------------------------------------------------------------
-- 2) clone_follow_tick(p_limit int DEFAULT 10) — cap cứng 10
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clone_follow_tick(p_limit int DEFAULT 10)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r record;
  done int := 0;
  v_limit int := GREATEST(LEAST(COALESCE(p_limit, 10), 10), 1);   -- HARD CAP 10
  v_actors uuid[] := ARRAY[]::uuid[];
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _flw_batch (id uuid, follower_id uuid, target_id uuid)
    ON COMMIT DROP;
  DELETE FROM _flw_batch;

  INSERT INTO _flw_batch (id, follower_id, target_id)
  SELECT t.id, t.follower_id, t.target_id
    FROM public.clone_follow_tasks t
   WHERE t.status = 'pending' AND t.run_at <= now()
   ORDER BY t.run_at
   LIMIT v_limit;

  SELECT COALESCE(array_agg(DISTINCT follower_id), ARRAY[]::uuid[])
    INTO v_actors FROM _flw_batch;

  IF COALESCE(array_length(v_actors, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- ONLINE ngay trước batch
  UPDATE public.profiles
     SET is_online = true
   WHERE id = ANY(v_actors);

  BEGIN
    FOR r IN SELECT * FROM _flw_batch LOOP
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
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.profiles
       SET is_online = false, last_seen = now()
     WHERE id = ANY(v_actors);
    RAISE;
  END;

  -- OFFLINE ngay sau batch
  UPDATE public.profiles
     SET is_online = false, last_seen = now()
   WHERE id = ANY(v_actors);

  RETURN done;
END $fn$;

-- ---------------------------------------------------------------------
-- 3) scheduler_run_due(p_limit int DEFAULT 10) — cap cứng 10
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scheduler_run_due(p_limit int DEFAULT 10)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r record;
  done int := 0;
  v_next timestamptz;
  v_fail int;
  v_limit int := GREATEST(LEAST(COALESCE(p_limit, 10), 10), 1);   -- HARD CAP 10
  v_actors uuid[] := ARRAY[]::uuid[];
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _sch_batch (task_id uuid, job_id uuid, account_id uuid)
    ON COMMIT DROP;
  DELETE FROM _sch_batch;

  INSERT INTO _sch_batch (task_id, job_id, account_id)
  SELECT t.id, t.job_id, t.account_id
    FROM public.scheduled_tasks t
    JOIN public.scheduled_jobs  j ON j.id = t.job_id
   WHERE t.status = 'pending'
     AND t.run_at <= now()
     AND j.status IN ('pending','running')
   ORDER BY t.run_at
   LIMIT v_limit;

  SELECT COALESCE(array_agg(DISTINCT account_id) FILTER (WHERE account_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_actors FROM _sch_batch;

  IF COALESCE(array_length(v_actors, 1), 0) > 0 THEN
    -- ONLINE ngay trước batch
    UPDATE public.profiles SET is_online = true WHERE id = ANY(v_actors);
  END IF;

  BEGIN
    FOR r IN SELECT * FROM _sch_batch LOOP
      UPDATE public.scheduled_tasks SET status='running', started_at=now() WHERE id = r.task_id;
      UPDATE public.scheduled_jobs  SET status='running', last_run_at=now(), updated_at=now()
       WHERE id = r.job_id AND status = 'pending';
      BEGIN
        PERFORM public._scheduler_exec_task(r.task_id);
        done := done + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.scheduled_tasks
           SET status='failed', finished_at=now(), error=SQLERRM WHERE id = r.task_id;
        UPDATE public.scheduled_jobs SET last_error=SQLERRM, updated_at=now() WHERE id = r.job_id;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    IF COALESCE(array_length(v_actors, 1), 0) > 0 THEN
      UPDATE public.profiles SET is_online = false, last_seen = now() WHERE id = ANY(v_actors);
    END IF;
    RAISE;
  END;

  -- OFFLINE ngay sau batch
  IF COALESCE(array_length(v_actors, 1), 0) > 0 THEN
    UPDATE public.profiles SET is_online = false, last_seen = now() WHERE id = ANY(v_actors);
  END IF;

  -- Chạy comment (cũng bị cap 10 bên trong)
  PERFORM public.scenario_comment_tick(10);

  -- Kết thúc job khi không còn task / comment chờ
  FOR r IN
    SELECT j.id AS job_id FROM public.scheduled_jobs j
     WHERE j.status = 'running'
       AND NOT EXISTS (SELECT 1 FROM public.scheduled_tasks t
                        WHERE t.job_id = j.id AND t.status IN ('pending','running'))
       AND NOT EXISTS (SELECT 1 FROM public.scenario_comment_tasks c
                        WHERE c.job_id = j.id AND c.status IN ('waiting','pending'))
  LOOP
    SELECT count(*) INTO v_fail FROM public.scheduled_tasks
     WHERE job_id = r.job_id AND status = 'failed';
    v_next := public._scheduler_next_run(r.job_id);
    IF v_next IS NOT NULL THEN
      UPDATE public.scheduled_jobs
         SET status='pending', run_at=v_next, runs_count=runs_count+1, updated_at=now()
       WHERE id = r.job_id;
      PERFORM public._scheduler_build_tasks(r.job_id);
    ELSE
      UPDATE public.scheduled_jobs
         SET status = CASE WHEN v_fail > 0 THEN 'failed' ELSE 'done' END,
             runs_count = runs_count + 1, next_run_at = NULL, updated_at = now()
       WHERE id = r.job_id;
    END IF;
  END LOOP;

  RETURN done;
END $fn$;

-- ---------------------------------------------------------------------
-- 4) Quyền
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.scheduler_run_due(int)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scenario_comment_tick(int)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_follow_tick(int)      FROM PUBLIC;

COMMIT;

-- ---------------------------------------------------------------------
-- 5) Lịch pg_cron — luôn gọi với limit = 10
-- ---------------------------------------------------------------------
DO $c$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
     WHERE jobname IN ('scheduler-run-due','scheduler_run_due',
                       'scenario_comment_tick','clone_follow_tick');

    PERFORM cron.schedule('scheduler-run-due',    '* * * * *',
                          $$SELECT public.scheduler_run_due(10);$$);
    PERFORM cron.schedule('scenario_comment_tick','* * * * *',
                          $$SELECT public.scenario_comment_tick(10);$$);
    PERFORM cron.schedule('clone_follow_tick',    '* * * * *',
                          $$SELECT public.clone_follow_tick(10);$$);
  END IF;
END $c$;

-- ---------------------------------------------------------------------
-- 6) Kiểm tra nhanh sau khi chạy
-- ---------------------------------------------------------------------
-- SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
-- SELECT count(*) AS clone_online FROM public.profiles
--  WHERE account_source = 'internal' AND is_online = true;   -- kỳ vọng: 0 lúc rảnh
