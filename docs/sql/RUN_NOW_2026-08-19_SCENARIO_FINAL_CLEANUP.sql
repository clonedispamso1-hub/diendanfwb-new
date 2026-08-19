-- =====================================================================
-- KỊCH BẢN UP BÀI + KỊCH BẢN BÌNH LUẬN — BẢN HOÀN THIỆN (FINAL CLEANUP)
-- Chạy 1 lần trong Supabase SQL Editor của DB CHÍNH (zbuwddjcqdlyijcunwgd).
-- Yêu cầu đã chạy trước:
--   • docs/sql/2026-08-17_SCHEDULER.sql (hoặc _PGCRON_SAFE)
--   • docs/sql/RUN_NOW_2026-08-19_SCENARIO_ENGINE.sql
--   • docs/sql/RUN_NOW_2026-08-19_SCENARIO_POST_V2.sql
--   • docs/sql/RUN_NOW_2026-08-19_SCENARIO_COMMENT_V3.sql
--
-- Nguyên tắc bắt buộc:
--   1. Kịch bản Bình Luận chỉ tồn tại khi Job Up Bài còn bài thật.
--   2. Không đếm bài bằng scheduled_jobs.account_ids — chỉ đếm scheduled_tasks.
--   3. Job không còn bài  ⇒ Job bị xoá (không hiển thị, không tồn tại).
--   4. Xoá theo dây chuyền bằng ON DELETE CASCADE + scenario_gc().
--   5. Scheduler tự dọn rác mỗi phút.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Khoá dây chuyền (ON DELETE CASCADE)
-- ---------------------------------------------------------------------
DO $fk$
DECLARE r record;
BEGIN
  -- gỡ toàn bộ FK cũ của 3 bảng liên quan rồi tạo lại đúng chuẩn CASCADE
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tbl
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.conrelid IN (
         'public.scheduled_tasks'::regclass,
         'public.scenario_comment_tasks'::regclass,
         'public.scenario_comment_configs'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $fk$;

ALTER TABLE public.scheduled_tasks
  ADD CONSTRAINT scheduled_tasks_job_fk
    FOREIGN KEY (job_id) REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE,
  ADD CONSTRAINT scheduled_tasks_account_fk
    FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.scenario_comment_configs
  ADD CONSTRAINT scenario_comment_configs_job_fk
    FOREIGN KEY (job_id) REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE;

ALTER TABLE public.scenario_comment_tasks
  ADD CONSTRAINT scenario_comment_tasks_job_fk
    FOREIGN KEY (job_id) REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE,
  ADD CONSTRAINT scenario_comment_tasks_post_task_fk
    FOREIGN KEY (post_task_id) REFERENCES public.scheduled_tasks(id) ON DELETE CASCADE,
  ADD CONSTRAINT scenario_comment_tasks_account_fk
    FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT scenario_comment_tasks_author_fk
    FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- clone_follow_tasks: clone bị xoá ⇒ hàng đợi follow cũng mất
DO $fk2$
DECLARE r record;
BEGIN
  IF to_regclass('public.clone_follow_tasks') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT conname FROM pg_constraint
            WHERE contype='f' AND conrelid='public.clone_follow_tasks'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.clone_follow_tasks DROP CONSTRAINT %I', r.conname);
  END LOOP;
  EXECUTE 'ALTER TABLE public.clone_follow_tasks
             ADD CONSTRAINT clone_follow_tasks_follower_fk
               FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
             ADD CONSTRAINT clone_follow_tasks_target_fk
               FOREIGN KEY (target_id) REFERENCES public.profiles(id) ON DELETE CASCADE';
END $fk2$;

-- ---------------------------------------------------------------------
-- 1) scenario_gc() — bộ dọn rác trung tâm (idempotent, rẻ, chạy mọi nơi)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_gc()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- (1) Comment mồ côi: mất Job / mất bài / mất clone
  DELETE FROM public.scenario_comment_tasks c
   WHERE NOT EXISTS (SELECT 1 FROM public.scheduled_jobs j WHERE j.id = c.job_id);

  DELETE FROM public.scenario_comment_tasks c
   WHERE c.post_task_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.scheduled_tasks t WHERE t.id = c.post_task_id);

  DELETE FROM public.scenario_comment_tasks c
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.account_id);

  -- (2) Job không còn bài thật ⇒ comment của Job đó biến mất
  DELETE FROM public.scenario_comment_tasks c
   WHERE NOT EXISTS (SELECT 1 FROM public.scheduled_tasks t
                      WHERE t.job_id = c.job_id AND t.status <> 'cancelled');

  -- (3) Slot ảo trỏ ra ngoài số bài hiện có
  DELETE FROM public.scenario_comment_tasks c
   WHERE c.post_task_id IS NULL
     AND c.slot_index > (SELECT count(*) FROM public.scheduled_tasks t
                          WHERE t.job_id = c.job_id AND t.status <> 'cancelled');

  -- (4) Job đã huỷ / lỗi / xong ⇒ không giữ hàng đợi comment chưa chạy
  DELETE FROM public.scenario_comment_tasks c
   USING public.scheduled_jobs j
   WHERE j.id = c.job_id
     AND c.status IN ('waiting','pending')
     AND j.status IN ('cancelled','failed','done');

  -- (5) Job kịch bản không còn bài nào ⇒ xoá Job (không để Job rác "40 clone / 0 bài")
  DELETE FROM public.scheduled_jobs j
   WHERE j.scenario_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.scheduled_tasks t WHERE t.job_id = j.id);

  -- (6) Config mồ côi: mất Job hoặc không còn comment nào
  DELETE FROM public.scenario_comment_configs g
   WHERE NOT EXISTS (SELECT 1 FROM public.scheduled_jobs j WHERE j.id = g.job_id)
      OR NOT EXISTS (SELECT 1 FROM public.scenario_comment_tasks c WHERE c.job_id = g.job_id);

  -- (7) account_ids còn trỏ tới clone đã bị xoá ⇒ làm sạch thống kê
  UPDATE public.scheduled_jobs j
     SET account_ids = COALESCE((
           SELECT array_agg(x) FROM unnest(j.account_ids) AS u(x)
            WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x)
         ), '{}'::uuid[])
   WHERE j.account_ids IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(j.account_ids) AS u(x)
                  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x));

  -- (8) Hàng đợi follow mồ côi
  IF to_regclass('public.clone_follow_tasks') IS NOT NULL THEN
    DELETE FROM public.clone_follow_tasks t
     WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.follower_id)
        OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.target_id);
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.scenario_gc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scenario_gc() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Trigger tự dọn — không phụ thuộc frontend
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._scenario_gc_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;  -- chống đệ quy CASCADE
  PERFORM public.scenario_gc();
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS scenario_gc_after_task_delete   ON public.scheduled_tasks;
DROP TRIGGER IF EXISTS scenario_gc_after_job_delete    ON public.scheduled_jobs;
DROP TRIGGER IF EXISTS scenario_gc_after_profile_delete ON public.profiles;

CREATE TRIGGER scenario_gc_after_task_delete
AFTER DELETE ON public.scheduled_tasks
FOR EACH STATEMENT EXECUTE FUNCTION public._scenario_gc_trg();

CREATE TRIGGER scenario_gc_after_job_delete
AFTER DELETE ON public.scheduled_jobs
FOR EACH STATEMENT EXECUTE FUNCTION public._scenario_gc_trg();

CREATE TRIGGER scenario_gc_after_profile_delete
AFTER DELETE ON public.profiles
FOR EACH STATEMENT EXECUTE FUNCTION public._scenario_gc_trg();

-- ---------------------------------------------------------------------
-- 3) Danh sách Job cho tab Bình Luận — chỉ Job THẬT, đếm bài từ scheduled_tasks
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_comment_jobs(int);
CREATE FUNCTION public.admin_scenario_comment_jobs(p_limit int DEFAULT 30)
RETURNS TABLE (job_id uuid, title text, scenario_name text, weekday int, status text,
               run_at timestamptz, clone_count int, post_total int, post_done int,
               cmt_total int, cmt_waiting int, cmt_pending int, cmt_done int, cmt_failed int,
               configured boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM public.scenario_gc();
  RETURN QUERY
  SELECT j.id, j.title, s.name, j.weekday, j.status, j.run_at,
         (SELECT count(DISTINCT t.account_id)::int FROM public.scheduled_tasks t
           WHERE t.job_id=j.id AND t.status <> 'cancelled'),
         (SELECT count(*)::int FROM public.scheduled_tasks t
           WHERE t.job_id=j.id AND t.status <> 'cancelled'),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='done'),
         (SELECT count(*)::int FROM public.scenario_comment_tasks c WHERE c.job_id=j.id),
         (SELECT count(*)::int FROM public.scenario_comment_tasks c WHERE c.job_id=j.id AND c.status='waiting'),
         (SELECT count(*)::int FROM public.scenario_comment_tasks c WHERE c.job_id=j.id AND c.status='pending'),
         (SELECT count(*)::int FROM public.scenario_comment_tasks c WHERE c.job_id=j.id AND c.status='done'),
         (SELECT count(*)::int FROM public.scenario_comment_tasks c WHERE c.job_id=j.id AND c.status='failed'),
         EXISTS (SELECT 1 FROM public.scenario_comment_configs g WHERE g.job_id=j.id)
    FROM public.scheduled_jobs j
    LEFT JOIN public.scenarios s ON s.id = j.scenario_id
   WHERE j.kind = 'post'
     AND j.status IN ('pending','running','paused')
     AND EXISTS (SELECT 1 FROM public.scheduled_tasks t
                  WHERE t.job_id = j.id AND t.status <> 'cancelled')
   ORDER BY j.created_at DESC
   LIMIT greatest(coalesce(p_limit,30),1);
END $fn$;

-- ---------------------------------------------------------------------
-- 4) Danh sách lượt chạy Up Bài — bỏ Job rỗng
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_runs(text, int);
CREATE FUNCTION public.admin_scenario_runs(p_kind text, p_limit int DEFAULT 20)
RETURNS TABLE (job_id uuid, title text, status text, weekday int, run_at timestamptz,
               total int, pending_count int, done_count int, failed_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM public.scenario_gc();
  RETURN QUERY
  SELECT j.id, j.title, j.status, j.weekday, j.run_at,
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='pending'),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='done'),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='failed')
    FROM public.scheduled_jobs j
   WHERE j.scenario_id IS NOT NULL AND j.kind = p_kind
     AND EXISTS (SELECT 1 FROM public.scheduled_tasks t WHERE t.job_id = j.id)
   ORDER BY j.created_at DESC
   LIMIT greatest(coalesce(p_limit,20),1);
END $fn$;

-- ---------------------------------------------------------------------
-- 5) APPLY — chỉ sinh comment trên BÀI THẬT (không dùng account_ids)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_comment_apply(uuid, int, int, int, int, text, uuid[]);
CREATE FUNCTION public.admin_scenario_comment_apply(
  p_job uuid,
  p_total int,
  p_pct_gif int DEFAULT 0,
  p_delay_min int DEFAULT 2,
  p_delay_max int DEFAULT 5,
  p_account_mode text DEFAULT 'random',
  p_account_ids uuid[] DEFAULT '{}'
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j public.scheduled_jobs;
  v_tasks uuid[] := '{}'::uuid[];
  v_authors uuid[] := '{}'::uuid[];
  n_slots int;
  v_texts text[]; v_gifs text[]; v_pool uuid[]; n_pool int;
  v_recent text[] := '{}'::text[];
  v_made int := 0; v_ti int := 0; v_pi int := 0;
  k int; slot int; guard int;
  v_kind text; v_content text; v_acc uuid; v_prev uuid := NULL; v_delay int;
  v_used uuid[];
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM public.scenario_gc();

  SELECT * INTO j FROM public.scheduled_jobs WHERE id = p_job AND kind = 'post';
  IF NOT FOUND THEN RAISE EXCEPTION 'Job Up Bài không còn tồn tại' USING ERRCODE='22023'; END IF;
  IF j.status NOT IN ('pending','running','paused') THEN
    RAISE EXCEPTION 'Job Up Bài đã kết thúc — không thể sinh comment' USING ERRCODE='22023';
  END IF;
  IF coalesce(p_total,0) <= 0 THEN RAISE EXCEPTION 'Số comment phải > 0' USING ERRCODE='22023'; END IF;
  IF coalesce(p_delay_min,2) < 0 OR coalesce(p_delay_max,5) < coalesce(p_delay_min,2) THEN
    RAISE EXCEPTION 'Khoảng delay không hợp lệ' USING ERRCODE='22023';
  END IF;

  -- (A) Slot bài = scheduled_tasks THẬT (không bao giờ dùng account_ids)
  SELECT coalesce(array_agg(t.id ORDER BY t.run_at, t.created_at), '{}'::uuid[]),
         coalesce(array_agg(t.account_id ORDER BY t.run_at, t.created_at), '{}'::uuid[])
    INTO v_tasks, v_authors
    FROM public.scheduled_tasks t
   WHERE t.job_id = p_job AND t.status <> 'cancelled';

  n_slots := coalesce(array_length(v_tasks,1),0);
  IF n_slots = 0 THEN
    RAISE EXCEPTION 'Job này không còn bài nào để bình luận' USING ERRCODE='22023';
  END IF;

  -- (B) Nguồn nội dung
  SELECT coalesce(array_agg(content ORDER BY random()), '{}'::text[]) INTO v_texts
    FROM public.scenario_comment_texts;
  SELECT coalesce(array_agg(url ORDER BY random()), '{}'::text[]) INTO v_gifs
    FROM public.gif_library WHERE kind IN ('gif','sticker');
  IF coalesce(array_length(v_texts,1),0) = 0 AND coalesce(array_length(v_gifs,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa có câu bot comment và cũng chưa có GIF nào' USING ERRCODE='22023';
  END IF;

  -- (C) Pool clone comment
  IF p_account_mode = 'manual' AND coalesce(array_length(p_account_ids,1),0) > 0 THEN
    SELECT coalesce(array_agg(p.id ORDER BY random()), '{}'::uuid[]) INTO v_pool
      FROM public.profiles p
     WHERE p.id = ANY(p_account_ids) AND p.account_source = 'internal'
       AND coalesce(p.is_banned,false) = false;
  ELSE
    SELECT coalesce(array_agg(p.id ORDER BY random()), '{}'::uuid[]) INTO v_pool
      FROM public.profiles p
     WHERE p.account_source = 'internal' AND coalesce(p.is_banned,false) = false;
  END IF;
  n_pool := coalesce(array_length(v_pool,1),0);
  IF n_pool = 0 THEN
    RAISE EXCEPTION 'Không có clone nào để bình luận' USING ERRCODE='22023';
  END IF;

  -- (D) Ghi cấu hình
  INSERT INTO public.scenario_comment_configs AS g (
    job_id, total_comments, mode, pct_gif, delay_min, delay_max,
    account_mode, account_ids, created_by, updated_at)
  VALUES (p_job, p_total, 'even', greatest(least(coalesce(p_pct_gif,0),100),0),
          coalesce(p_delay_min,2), coalesce(p_delay_max,5),
          coalesce(p_account_mode,'random'), coalesce(p_account_ids,'{}'::uuid[]), auth.uid(), now())
  ON CONFLICT (job_id) DO UPDATE SET
    total_comments = EXCLUDED.total_comments, mode = 'even',
    pct_gif = EXCLUDED.pct_gif,
    delay_min = EXCLUDED.delay_min, delay_max = EXCLUDED.delay_max,
    account_mode = EXCLUDED.account_mode, account_ids = EXCLUDED.account_ids,
    updated_at = now();

  -- (E) Sinh lại hàng đợi chưa chạy
  DELETE FROM public.scenario_comment_tasks
   WHERE job_id = p_job AND status IN ('waiting','pending');

  -- (F) Round robin tuyệt đối trên slot bài thật
  FOR k IN 1..p_total LOOP
    slot := ((k - 1) % n_slots) + 1;

    v_used := '{}'::uuid[];
    SELECT coalesce(array_agg(c.account_id), '{}'::uuid[]) INTO v_used
      FROM public.scenario_comment_tasks c
     WHERE c.job_id = p_job AND c.slot_index = slot AND c.status IN ('waiting','pending');

    v_acc := NULL;
    guard := 0;
    WHILE guard < n_pool LOOP
      v_pi := (v_pi % n_pool) + 1;
      guard := guard + 1;
      IF v_pool[v_pi] IS DISTINCT FROM v_authors[slot]
         AND v_pool[v_pi] IS DISTINCT FROM v_prev
         AND NOT (v_pool[v_pi] = ANY(v_used)) THEN
        v_acc := v_pool[v_pi];
        EXIT;
      END IF;
    END LOOP;

    IF v_acc IS NULL THEN
      SELECT x INTO v_acc FROM unnest(v_pool) AS u(x)
       WHERE x IS DISTINCT FROM v_authors[slot] AND x IS DISTINCT FROM v_prev
       ORDER BY random() LIMIT 1;
    END IF;
    IF v_acc IS NULL THEN
      SELECT x INTO v_acc FROM unnest(v_pool) AS u(x)
       WHERE x IS DISTINCT FROM v_authors[slot]
       ORDER BY random() LIMIT 1;
    END IF;
    CONTINUE WHEN v_acc IS NULL;
    v_prev := v_acc;

    IF coalesce(array_length(v_gifs,1),0) > 0
       AND (random() * 100) < greatest(least(coalesce(p_pct_gif,0),100),0) THEN
      v_kind := 'gif';
      v_content := '[[gif:' || v_gifs[1 + floor(random()*array_length(v_gifs,1))::int] || ']]';
    ELSE
      v_kind := 'text';
      guard := 0;
      LOOP
        guard := guard + 1;
        v_ti := v_ti + 1;
        IF v_ti > coalesce(array_length(v_texts,1),0) THEN
          SELECT coalesce(array_agg(content ORDER BY random()), '{}'::text[]) INTO v_texts
            FROM public.scenario_comment_texts;
          v_ti := 1;
        END IF;
        v_content := v_texts[v_ti];
        EXIT WHEN v_content IS NOT NULL
              AND (NOT (v_content = ANY(v_recent)) OR guard > coalesce(array_length(v_texts,1),1));
      END LOOP;
      v_recent := (v_recent || v_content);
      IF array_length(v_recent,1) > 30 THEN
        v_recent := v_recent[2:array_length(v_recent,1)];
      END IF;
    END IF;

    v_delay := (coalesce(p_delay_min,2) * 60)
             + floor(random() * ((coalesce(p_delay_max,5) - coalesce(p_delay_min,2)) * 60 + 1))::int;

    INSERT INTO public.scenario_comment_tasks
      (job_id, post_task_id, slot_index, author_id, account_id, kind, content, delay_seconds, status)
    VALUES (p_job, v_tasks[slot], slot, v_authors[slot], v_acc, v_kind, v_content,
            greatest(v_delay,10), 'waiting');
    v_made := v_made + 1;
  END LOOP;

  IF v_made = 0 THEN
    DELETE FROM public.scenario_comment_configs WHERE job_id = p_job;
    RAISE EXCEPTION 'Không sinh được comment nào (thiếu clone hợp lệ)' USING ERRCODE='22023';
  END IF;
  RETURN v_made;
END $fn$;

-- ---------------------------------------------------------------------
-- 6) Xem / xoá hàng đợi comment
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_comment_tasks(uuid, int);
CREATE FUNCTION public.admin_scenario_comment_tasks(p_job uuid, p_limit int DEFAULT 1000)
RETURNS TABLE (task_id uuid, post_task_id uuid, slot_index int, account_id uuid,
               username text, full_name text, avatar text, gender text,
               kind text, content text, delay_seconds int,
               run_at timestamptz, status text, post_id uuid, error text,
               author_username text, post_run_at timestamptz, post_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM public.scenario_gc();
  RETURN QUERY
  SELECT c.id, c.post_task_id, c.slot_index, c.account_id, p.username, p.full_name, p.avatar, p.gender,
         c.kind, c.content, c.delay_seconds, c.run_at, c.status, c.post_id, c.error,
         coalesce(a.username, a2.username), t.run_at, t.status
    FROM public.scenario_comment_tasks c
    LEFT JOIN public.scheduled_tasks t ON t.id = c.post_task_id
    LEFT JOIN public.profiles p  ON p.id = c.account_id
    LEFT JOIN public.profiles a  ON a.id = t.account_id
    LEFT JOIN public.profiles a2 ON a2.id = c.author_id
   WHERE c.job_id = p_job
   ORDER BY c.slot_index, c.delay_seconds
   LIMIT greatest(coalesce(p_limit,1000),1);
END $fn$;

DROP FUNCTION IF EXISTS public.admin_scenario_comment_task_delete(uuid);
CREATE FUNCTION public.admin_scenario_comment_task_delete(p_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scenario_comment_tasks WHERE id = p_task;
  PERFORM public.scenario_gc();
END $fn$;

-- Xoá SẠCH hàng đợi comment của Job (mọi trạng thái) + config
DROP FUNCTION IF EXISTS public.admin_scenario_comment_clear(uuid);
CREATE FUNCTION public.admin_scenario_comment_clear(p_job uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scenario_comment_tasks WHERE job_id = p_job;
  GET DIAGNOSTICS v = ROW_COUNT;
  DELETE FROM public.scenario_comment_configs WHERE job_id = p_job;
  PERFORM public.scenario_gc();
  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 7) Điều khiển Job Up Bài — Cancel = xoá sạch hàng đợi
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_run_set_status(uuid, text);
CREATE FUNCTION public.admin_scenario_run_set_status(p_job uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('pending','paused','cancelled') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ' USING ERRCODE='22023';
  END IF;

  UPDATE public.scheduled_jobs SET status = p_status, updated_at = now()
   WHERE id = p_job AND kind = 'post';

  IF p_status = 'cancelled' THEN
    -- comment biến mất ngay, không giữ tồn kho
    DELETE FROM public.scenario_comment_tasks WHERE job_id = p_job;
    DELETE FROM public.scenario_comment_configs WHERE job_id = p_job;
    -- bài chưa chạy bị xoá; nếu Job không còn bài nào ⇒ scenario_gc() xoá luôn Job
    DELETE FROM public.scheduled_tasks WHERE job_id = p_job AND status IN ('pending','running');
  END IF;

  PERFORM public.scenario_gc();
END $fn$;

-- ---------------------------------------------------------------------
-- 8) Xoá bài / xoá lượt chạy / xoá toàn bộ hàng chờ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scenario_task_delete(p_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scheduled_tasks WHERE id = p_task AND status = 'pending';
  PERFORM public.scenario_gc();
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_run_delete(p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scenario_comment_tasks   WHERE job_id = p_job;
  DELETE FROM public.scenario_comment_configs WHERE job_id = p_job;
  DELETE FROM public.scheduled_tasks          WHERE job_id = p_job;
  DELETE FROM public.scheduled_jobs           WHERE id = p_job;
  PERFORM public.scenario_gc();
END $fn$;

DROP FUNCTION IF EXISTS public.admin_scenario_purge_pending();
CREATE FUNCTION public.admin_scenario_purge_pending()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scheduled_tasks t
   USING public.scheduled_jobs j
   WHERE t.job_id = j.id AND j.scenario_id IS NOT NULL AND t.status = 'pending';
  GET DIAGNOSTICS v = ROW_COUNT;
  PERFORM public.scenario_gc();
  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 9) Bộ chạy comment — dọn rác trước, không tạo trạng thái mồ côi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_comment_tick(p_limit int DEFAULT 200)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; v_id uuid; done int := 0;
BEGIN
  PERFORM public.scenario_gc();

  -- a) map slot → bài thật
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

  -- a2) clone trùng chủ bài → đổi clone khác
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

  -- b) bài đã đăng → hẹn giờ comment
  UPDATE public.scenario_comment_tasks c
     SET post_id = t.result_id,
         run_at  = coalesce(t.finished_at, now()) + make_interval(secs => c.delay_seconds),
         status  = 'pending'
    FROM public.scheduled_tasks t
   WHERE t.id = c.post_task_id
     AND c.status = 'waiting'
     AND t.status = 'done'
     AND t.result_id IS NOT NULL;

  -- c) bài hỏng / huỷ → XOÁ comment (không giữ bản ghi rác)
  DELETE FROM public.scenario_comment_tasks c
   USING public.scheduled_tasks t
   WHERE t.id = c.post_task_id
     AND c.status IN ('waiting','pending')
     AND t.status IN ('failed','cancelled');

  -- d) bài gốc đã bị xoá khỏi hệ thống → comment cũng mất
  DELETE FROM public.scenario_comment_tasks c
   WHERE c.status = 'pending'
     AND c.post_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = c.post_id);

  -- e) chạy comment tới giờ
  FOR r IN
    SELECT c.id, c.post_id, c.account_id, c.content
      FROM public.scenario_comment_tasks c
      JOIN public.scheduled_jobs j ON j.id = c.job_id
     WHERE c.status = 'pending' AND c.run_at <= now()
       AND c.post_id IS NOT NULL
       AND j.status IN ('pending','running')
     ORDER BY c.run_at
     LIMIT greatest(coalesce(p_limit,200),1)
     FOR UPDATE OF c SKIP LOCKED
  LOOP
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

  RETURN done;
END $fn$;

-- ---------------------------------------------------------------------
-- 10) scheduler_run_due(): chạy bài + comment + dọn rác
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scheduler_run_due(p_limit int DEFAULT 200)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; done int := 0; v_next timestamptz; v_fail int;
BEGIN
  PERFORM public.scenario_gc();

  FOR r IN
    SELECT t.id AS task_id, t.job_id AS job_id
      FROM public.scheduled_tasks t
      JOIN public.scheduled_jobs  j ON j.id = t.job_id
     WHERE t.status = 'pending'
       AND t.run_at <= now()
       AND j.status IN ('pending','running')
     ORDER BY t.run_at
     LIMIT greatest(coalesce(p_limit,200), 1)
     FOR UPDATE OF t SKIP LOCKED
  LOOP
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

  PERFORM public.scenario_comment_tick(p_limit);

  -- kết thúc job khi hết bài VÀ hết comment
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
      -- Finish: dọn sạch cấu hình + hàng đợi comment còn sót
      DELETE FROM public.scenario_comment_tasks
       WHERE job_id = r.job_id AND status IN ('waiting','pending');
      DELETE FROM public.scenario_comment_configs WHERE job_id = r.job_id;
    END IF;
  END LOOP;

  PERFORM public.scenario_gc();
  RETURN done;
END $fn$;

-- ---------------------------------------------------------------------
-- 11) clone_follow_tick(): tự dọn task mồ côi trước khi chạy
-- ---------------------------------------------------------------------
DO $cf$
BEGIN
  IF to_regclass('public.clone_follow_tasks') IS NULL THEN RETURN; END IF;
  EXECUTE $q$
    CREATE OR REPLACE FUNCTION public._clone_follow_gc()
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
    BEGIN
      DELETE FROM public.clone_follow_tasks t
       WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.follower_id)
          OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.target_id);
    END $f$;
  $q$;
END $cf$;

-- ---------------------------------------------------------------------
-- 12) DỌN MỘT LẦN toàn bộ rác đang tồn kho
-- ---------------------------------------------------------------------
SELECT public.scenario_gc();

-- ---------------------------------------------------------------------
-- 13) Quyền gọi RPC
-- ---------------------------------------------------------------------
DO $g$
DECLARE f text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'admin_scenario%' OR p.proname LIKE 'admin_comment_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $g$;

REVOKE ALL ON FUNCTION public.scenario_comment_tick(int) FROM PUBLIC;

-- =====================================================================
-- KIỂM TRA NHANH
--   SELECT public.scenario_gc();
--   SELECT * FROM public.admin_scenario_comment_jobs(30);   -- không còn Job 0 bài
--   SELECT count(*) FROM public.scenario_comment_tasks c
--     WHERE NOT EXISTS (SELECT 1 FROM public.scheduled_jobs j WHERE j.id=c.job_id); -- = 0
-- =====================================================================
