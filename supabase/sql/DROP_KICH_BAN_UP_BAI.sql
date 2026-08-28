-- =====================================================================
-- GỠ BỎ HOÀN TOÀN TÍNH NĂNG "KỊCH BẢN UP BÀI" (AUTO-POST)
-- Chạy trong SQL Editor của: SB1 — DB CHÍNH (project zbuwddjcqdlyijcunwgd)
-- KHÔNG chạy ở SB2 (media) hay SB3 (logs).
-- Ghi chú: cấu hình autopost_config lưu ở SB2 (site_settings2) — xoá ở cuối file.
-- =====================================================================

BEGIN;

-- 1) Huỷ lịch pg_cron của scheduler auto-post (bỏ qua nếu không có pg_cron)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE command ILIKE '%scheduler_run_due%'
       OR command ILIKE '%scenario%'
       OR command ILIKE '%autopost%';
  END IF;
END $$;

-- 2) Trigger
DROP TRIGGER IF EXISTS scenario_gc_after_job_delete ON public.scheduled_jobs;
DROP TRIGGER IF EXISTS scenario_gc_after_task_delete ON public.scheduled_tasks;
DROP TRIGGER IF EXISTS scenario_gc_after_profile_delete ON public.profiles;

-- 3) RPC / Function
DROP FUNCTION IF EXISTS public._scenario_gc_trg() CASCADE;
DROP FUNCTION IF EXISTS public.scenario_gc() CASCADE;
DROP FUNCTION IF EXISTS public.scenario_comment_tick() CASCADE;
DROP FUNCTION IF EXISTS public.scheduler_run_due() CASCADE;
DROP FUNCTION IF EXISTS public._scheduler_exec_task(uuid) CASCADE;

DROP FUNCTION IF EXISTS public.admin_scenario_list() CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_create(text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_rename(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_delete(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_days() CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_day_save(int, int, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_captions(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_set_captions(uuid, text[]) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_run(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_runs(text, int) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_run_delete(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_run_set_status(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_tasks(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_task_update(uuid, timestamptz, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_task_delete(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_purge_pending() CASCADE;

DROP FUNCTION IF EXISTS public.admin_scenario_post_list() CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_post_save(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_post_delete_many(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_post_days() CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_post_day_set(int, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_post_run(uuid, uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_clones(text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_clone_random(int, int) CASCADE;

DROP FUNCTION IF EXISTS public.admin_scenario_comment_apply(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_comment_clear() CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_comment_jobs() CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_comment_tasks(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_scenario_comment_task_delete(uuid) CASCADE;

DROP FUNCTION IF EXISTS public.admin_autopost_next_task(int) CASCADE;
DROP FUNCTION IF EXISTS public.admin_autopost_exec_task(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_autopost_reschedule(uuid, timestamptz) CASCADE;

-- Dọn mọi hàm còn sót cùng họ tên (phòng khi chữ ký khác)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE '%scenario%' OR p.proname LIKE '%autopost%'
           OR p.proname IN ('scheduler_run_due', '_scheduler_exec_task'))
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 4) Bảng dữ liệu kịch bản / hàng chờ auto-post
DROP TABLE IF EXISTS public.scenario_captions CASCADE;
DROP TABLE IF EXISTS public.scenario_days CASCADE;
DROP TABLE IF EXISTS public.scenario_posts CASCADE;
DROP TABLE IF EXISTS public.scenario_post_days CASCADE;
DROP TABLE IF EXISTS public.scenarios CASCADE;
DROP TABLE IF EXISTS public.scheduled_tasks CASCADE;
DROP TABLE IF EXISTS public.scheduled_jobs CASCADE;
-- Tên bảng dự phòng (nếu tồn tại ở bản cũ)
DROP TABLE IF EXISTS public.bot_post_queue CASCADE;
DROP TABLE IF EXISTS public.bot_post_schedules CASCADE;
DROP TABLE IF EXISTS public.bot_scripts CASCADE;

COMMIT;

-- =====================================================================
-- 5) SB2 (Media / site_settings2) — xoá cấu hình autopost đã lưu.
--    Chạy đoạn dưới trong SQL Editor của SB2, KHÔNG chạy ở SB1.
-- =====================================================================
-- DELETE FROM public.site_settings2 WHERE key = 'autopost_config';
