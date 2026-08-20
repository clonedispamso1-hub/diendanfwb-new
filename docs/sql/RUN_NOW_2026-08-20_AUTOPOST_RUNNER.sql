-- =====================================================================
-- AUTO-POST RUNNER (zero-polling, chạy từ Admin Panel)
-- Chạy 1 lần trong Supabase SQL Editor của DB CHÍNH.
--
-- 3 RPC:
--   admin_autopost_next_task(p_limit int)  -> 1 task đang chờ (id + run_at)
--   admin_autopost_exec_task(p_task uuid)  -> đăng bài + set status='done'
--   admin_autopost_reschedule(task, at)    -> đổi giờ chạy task đang chờ
--
-- Tối ưu tài nguyên: index cho hàng đợi + SKIP LOCKED chống chạy trùng.
-- =====================================================================

CREATE INDEX IF NOT EXISTS scheduled_tasks_pending_run_at_idx
  ON public.scheduled_tasks (run_at)
  WHERE status = 'pending';

-- 1) Lấy ĐÚNG 1 task đang chờ (chỉ 2 cột cần thiết)
DROP FUNCTION IF EXISTS public.admin_autopost_next_task(int);
CREATE FUNCTION public.admin_autopost_next_task(p_limit int DEFAULT 1)
RETURNS TABLE (task_id uuid, run_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id, t.run_at
    FROM public.scheduled_tasks t
    JOIN public.scheduled_jobs  j ON j.id = t.job_id
   WHERE t.status = 'pending'
     AND j.status IN ('pending','running')
   ORDER BY t.run_at
   LIMIT greatest(coalesce(p_limit,1), 1);
END $fn$;

-- 2) Thực thi 1 task (đăng bài) — chống chạy trùng bằng SKIP LOCKED
DROP FUNCTION IF EXISTS public.admin_autopost_exec_task(uuid);
CREATE FUNCTION public.admin_autopost_exec_task(p_task uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid; v_job uuid;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

  SELECT t.id, t.job_id INTO v_id, v_job
    FROM public.scheduled_tasks t
   WHERE t.id = p_task AND t.status = 'pending'
   FOR UPDATE SKIP LOCKED;
  IF v_id IS NULL THEN RETURN false; END IF;

  UPDATE public.scheduled_tasks SET status='running', started_at=now() WHERE id = v_id;
  UPDATE public.scheduled_jobs  SET status='running', last_run_at=now(), updated_at=now()
   WHERE id = v_job AND status = 'pending';

  BEGIN
    PERFORM public._scheduler_exec_task(v_id);  -- set status='done' khi thành công
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.scheduled_tasks
       SET status='failed', finished_at=now(), error=SQLERRM WHERE id = v_id;
    UPDATE public.scheduled_jobs SET last_error=SQLERRM, updated_at=now() WHERE id = v_job;
    RETURN false;
  END;

  -- đóng job khi không còn task chờ
  UPDATE public.scheduled_jobs j
     SET status='done', updated_at=now()
   WHERE j.id = v_job AND j.status='running'
     AND NOT EXISTS (SELECT 1 FROM public.scheduled_tasks t
                      WHERE t.job_id = j.id AND t.status IN ('pending','running'));
  RETURN true;
END $fn$;

-- 3) Đổi giờ chạy 1 task đang chờ
DROP FUNCTION IF EXISTS public.admin_autopost_reschedule(uuid, timestamptz);
CREATE FUNCTION public.admin_autopost_reschedule(p_task uuid, p_run_at timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.scheduled_tasks SET run_at = p_run_at
   WHERE id = p_task AND status = 'pending';
END $fn$;

GRANT EXECUTE ON FUNCTION public.admin_autopost_next_task(int)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_autopost_exec_task(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_autopost_reschedule(uuid, timestamptz) TO authenticated;
