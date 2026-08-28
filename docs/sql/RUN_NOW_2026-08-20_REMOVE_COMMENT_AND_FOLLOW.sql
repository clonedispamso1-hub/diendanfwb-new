-- =====================================================================
-- GỠ SẠCH 2 TÍNH NĂNG: "KỊCH BẢN BÌNH LUẬN" + "THEO DÕI THÀNH VIÊN"
-- Chạy 1 lần trong Supabase SQL Editor của DB CHÍNH (zbuwddjcqdlyijcunwgd).
-- Idempotent — chạy lại nhiều lần vẫn an toàn.
--
-- GIỮ NGUYÊN: Kịch bản Up Bài (scheduled_jobs / scheduled_tasks / scenarios),
--             public.posts, public.comments, public.follows (dữ liệu thật).
-- XOÁ: bảng, hàng đợi, RPC, tick function, pg_cron job của 2 tính năng trên.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) DỪNG MỌI TIẾN TRÌNH NỀN CỦA 2 TÍNH NĂNG (pg_cron)
-- ---------------------------------------------------------------------
DO $c$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
     WHERE jobname IN (
       'scenario_comment_tick', 'scenario-comment-tick',
       'clone_follow_tick', 'clone-follow-tick'
     );
  END IF;
END $c$;

-- ---------------------------------------------------------------------
-- 2) scenario_gc(): bản mới CHỈ dọn rác của Kịch bản Up Bài
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_gc()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- Job kịch bản không còn bài nào ⇒ xoá Job rác
  DELETE FROM public.scheduled_jobs j
   WHERE j.scenario_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.scheduled_tasks t WHERE t.job_id = j.id);

  -- account_ids còn trỏ tới clone đã bị xoá ⇒ làm sạch thống kê
  UPDATE public.scheduled_jobs j
     SET account_ids = COALESCE((
           SELECT array_agg(x) FROM unnest(j.account_ids) AS u(x)
            WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x)
         ), '{}'::uuid[])
   WHERE j.account_ids IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(j.account_ids) AS u(x)
                  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x));
END $fn$;

REVOKE ALL ON FUNCTION public.scenario_gc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scenario_gc() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) scheduler_run_due(): bỏ mọi tham chiếu comment / follow
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
  PERFORM public.scenario_gc();

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

  IF COALESCE(array_length(v_actors, 1), 0) > 0 THEN
    UPDATE public.profiles SET is_online = false, last_seen = now() WHERE id = ANY(v_actors);
  END IF;

  -- Kết thúc job khi không còn task chờ
  FOR r IN
    SELECT j.id AS job_id FROM public.scheduled_jobs j
     WHERE j.status = 'running'
       AND NOT EXISTS (SELECT 1 FROM public.scheduled_tasks t
                        WHERE t.job_id = j.id AND t.status IN ('pending','running'))
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

  PERFORM public.scenario_gc();
  RETURN done;
END $fn$;

REVOKE ALL ON FUNCTION public.scheduler_run_due(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scheduler_run_due(int) TO service_role;

-- ---------------------------------------------------------------------
-- 4) clear_bot_scenario_data(): chỉ còn 'posts' | 'all'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_bot_scenario_data(p_tab text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tab  text := lower(coalesce(p_tab, 'all'));
  result jsonb := '{}'::jsonb;
  n      bigint;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_tab NOT IN ('posts', 'all') THEN
    RAISE EXCEPTION 'p_tab không hợp lệ (posts | all)' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.scheduled_tasks;
  GET DIAGNOSTICS n = ROW_COUNT;
  result := result || jsonb_build_object('scheduled_tasks', n);

  DELETE FROM public.scheduled_jobs;
  GET DIAGNOSTICS n = ROW_COUNT;
  result := result || jsonb_build_object('scheduled_jobs', n);

  RETURN result || jsonb_build_object('tab', v_tab, 'cleared_at', now());
END $$;

REVOKE ALL ON FUNCTION public.clear_bot_scenario_data(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_bot_scenario_data(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) XOÁ RPC / TICK FUNCTION CỦA 2 TÍNH NĂNG
-- ---------------------------------------------------------------------
DO $d$
DECLARE f text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'admin_scenario_comment_jobs',
         'admin_scenario_comment_apply',
         'admin_scenario_comment_tasks',
         'admin_scenario_comment_task_delete',
         'admin_scenario_comment_clear',
         'admin_scenario_run_set_status',
         'admin_comment_text_list',
         'admin_comment_text_add',
         'admin_comment_text_delete',
         'admin_comment_sources',
         'scenario_comment_tick',
         'admin_follow_user_list',
         'admin_clone_follow_apply',
         'admin_clone_follow_tasks',
         'admin_clone_follow_clear',
         'clone_follow_tick',
         '_clone_follow_gc'
       )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', f);
  END LOOP;
END $d$;

-- ---------------------------------------------------------------------
-- 6) XOÁ BẢNG + DỮ LIỆU MỒ CÔI (hàng đợi, cấu hình, kho câu bình luận)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.scenario_comment_tasks   CASCADE;
DROP TABLE IF EXISTS public.scenario_comment_configs CASCADE;
DROP TABLE IF EXISTS public.scenario_comment_texts   CASCADE;
DROP TABLE IF EXISTS public.clone_follow_tasks       CASCADE;

-- ---------------------------------------------------------------------
-- 7) DỌN LẦN CUỐI
-- ---------------------------------------------------------------------
SELECT public.scenario_gc();

-- =====================================================================
-- KIỂM TRA SAU KHI CHẠY
--   SELECT to_regclass('public.scenario_comment_tasks');  -- NULL
--   SELECT to_regclass('public.clone_follow_tasks');      -- NULL
--   SELECT jobname FROM cron.job ORDER BY jobname;        -- chỉ còn scheduler-run-due
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND (proname LIKE '%comment_tick%'
--       OR proname LIKE '%clone_follow%' OR proname LIKE 'admin_comment_%');  -- 0 dòng
-- =====================================================================
