-- =====================================================================
-- SCHEDULER (Đăng bài / Bình luận tự động) — chạy hoàn toàn phía Server
-- Không phụ thuộc trình duyệt: pg_cron gọi public.scheduler_run_due()
-- mỗi phút. Chỉ THÊM bảng mới, không đụng bảng/dữ liệu cũ.
-- Chạy 1 lần trong Supabase SQL Editor (project cũ zbuwddjcqdlyijcunwgd).
-- =====================================================================

-- LƯU Ý: KHÔNG chạy CREATE EXTENSION pg_cron ở đây.
-- Project này đã cài sẵn pg_cron; chạy lại sẽ gây lỗi
-- "ERROR: 2BP01 dependent privileges exist". Cũng không GRANT/REVOKE gì trên
-- schema cron. Script chỉ kiểm tra extension đã tồn tại.
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron chưa được cài. Hãy bật extension pg_cron trong Dashboard > Database > Extensions rồi chạy lại file này.';
  END IF;
END $chk$;

-- ---------------------------------------------------------------------
-- 1) Bảng lịch
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL CHECK (kind IN ('post','comment')),
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','running','done','failed','cancelled','paused')),
  title             text,
  created_by        uuid,
  content           text,
  image_urls        text[],
  gif_url           text,
  voice_token       text,
  facebook_url      text,
  zalo_url          text,
  account_ids       uuid[] NOT NULL DEFAULT '{}',
  post_ids          uuid[] NOT NULL DEFAULT '{}',
  run_at            timestamptz NOT NULL,
  stagger_minutes   int NOT NULL DEFAULT 0,
  recurrence        text NOT NULL DEFAULT 'none'
                      CHECK (recurrence IN ('none','minutes','daily','weekly')),
  recur_interval_minutes int,
  recur_time        time,
  recur_days        int[],            -- 0=CN .. 6=T7
  recur_until       timestamptz,
  next_run_at       timestamptz,
  last_run_at       timestamptz,
  last_error        text,
  runs_count        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL,
  post_id      uuid,
  content      text,
  run_at       timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','done','failed','cancelled')),
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  result_id    uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_tasks_due_idx ON public.scheduled_tasks (status, run_at);
CREATE INDEX IF NOT EXISTS scheduled_tasks_job_idx ON public.scheduled_tasks (job_id);
CREATE INDEX IF NOT EXISTS scheduled_jobs_status_idx ON public.scheduled_jobs (status, run_at);

ALTER TABLE public.scheduled_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;
-- Không tạo policy: chỉ truy cập qua RPC SECURITY DEFINER bên dưới.
GRANT ALL ON public.scheduled_jobs, public.scheduled_tasks TO service_role;

-- ---------------------------------------------------------------------
-- 2) Sinh danh sách task cho một lần chạy
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._scheduler_build_tasks(p_job uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE j public.scheduled_jobs; i int; n int := 0; v_at timestamptz; a uuid; p uuid;
BEGIN
  SELECT * INTO j FROM public.scheduled_jobs WHERE id = p_job;
  IF NOT FOUND THEN RETURN 0; END IF;

  i := 0;
  FOREACH a IN ARRAY coalesce(j.account_ids, '{}'::uuid[]) LOOP
    v_at := j.run_at + make_interval(mins => i * coalesce(j.stagger_minutes,0));
    IF j.kind = 'post' THEN
      INSERT INTO public.scheduled_tasks (job_id, account_id, content, run_at)
      VALUES (j.id, a, j.content, v_at);
      n := n + 1;
    ELSE
      FOREACH p IN ARRAY coalesce(j.post_ids, '{}'::uuid[]) LOOP
        INSERT INTO public.scheduled_tasks (job_id, account_id, post_id, content, run_at)
        VALUES (j.id, a, p, j.content, v_at);
        n := n + 1;
      END LOOP;
    END IF;
    i := i + 1;
  END LOOP;

  UPDATE public.scheduled_jobs SET next_run_at = j.run_at, updated_at = now() WHERE id = j.id;
  RETURN n;
END $fn$;

-- ---------------------------------------------------------------------
-- 3) Tính lần chạy kế tiếp (recurring)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._scheduler_next_run(p_job uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE j public.scheduled_jobs; v timestamptz; d int; k int;
BEGIN
  SELECT * INTO j FROM public.scheduled_jobs WHERE id = p_job;
  IF NOT FOUND OR j.recurrence = 'none' THEN RETURN NULL; END IF;

  IF j.recurrence = 'minutes' THEN
    v := greatest(j.run_at, now()) + make_interval(mins => greatest(coalesce(j.recur_interval_minutes,60),1));
  ELSIF j.recurrence = 'daily' THEN
    v := (date_trunc('day', now()) + coalesce(j.recur_time, j.run_at::time));
    IF v <= now() THEN v := v + interval '1 day'; END IF;
  ELSE -- weekly
    v := NULL;
    FOR k IN 1..8 LOOP
      v := (date_trunc('day', now()) + make_interval(days => k)) + coalesce(j.recur_time, j.run_at::time);
      d := EXTRACT(dow FROM v)::int;
      EXIT WHEN coalesce(array_length(j.recur_days,1),0) = 0 OR d = ANY (j.recur_days);
    END LOOP;
  END IF;

  IF j.recur_until IS NOT NULL AND v > j.recur_until THEN RETURN NULL; END IF;
  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 4) Thực thi 1 task (đăng bài hoặc bình luận)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._scheduler_exec_task(p_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t public.scheduled_tasks; j public.scheduled_jobs;
  v_id uuid; v_imgs text[]; v_body text; v_cols text; v_vals text;
BEGIN
  SELECT * INTO t FROM public.scheduled_tasks WHERE id = p_task;
  SELECT * INTO j FROM public.scheduled_jobs  WHERE id = t.job_id;

  v_body := coalesce(nullif(trim(coalesce(t.content,'')),''), '');
  IF j.gif_url IS NOT NULL THEN
    v_body := btrim(v_body || E'\n' || '[[gif:' || j.gif_url || ']]', E'\n');
  END IF;
  IF j.voice_token IS NOT NULL THEN
    v_body := btrim(v_body || E'\n' || j.voice_token, E'\n');
  END IF;

  IF j.kind = 'post' THEN
    v_imgs := coalesce(j.image_urls, '{}'::text[]);
    IF nullif(trim(v_body),'') IS NULL AND array_length(v_imgs,1) IS NULL THEN
      RAISE EXCEPTION 'Bài viết trống';
    END IF;
    v_cols := 'user_id, content';
    v_vals := '$1, $2';
    IF public._has_column('posts','image_url') THEN
      v_cols := v_cols || ', image_url';
      v_vals := v_vals || ', ' || coalesce(quote_literal(v_imgs[1]), 'NULL');
    END IF;
    IF public._has_column('posts','image_urls') THEN
      v_cols := v_cols || ', image_urls';
      v_vals := v_vals || ', ' || CASE WHEN array_length(v_imgs,1) IS NULL THEN 'NULL'
                                       ELSE quote_literal(v_imgs::text) || '::text[]' END;
    END IF;
    IF public._has_column('posts','has_images') THEN
      v_cols := v_cols || ', has_images';
      v_vals := v_vals || ', ' || (array_length(v_imgs,1) IS NOT NULL)::text;
    END IF;
    IF public._has_column('posts','visibility') THEN
      v_cols := v_cols || ', visibility'; v_vals := v_vals || ', ' || quote_literal('home');
    END IF;
    IF public._has_column('posts','status') THEN
      v_cols := v_cols || ', status'; v_vals := v_vals || ', ' || quote_literal('published');
    END IF;
    IF public._has_column('posts','facebook_url') AND j.facebook_url IS NOT NULL THEN
      v_cols := v_cols || ', facebook_url'; v_vals := v_vals || ', ' || quote_literal(j.facebook_url);
    END IF;
    IF public._has_column('posts','zalo_url') AND j.zalo_url IS NOT NULL THEN
      v_cols := v_cols || ', zalo_url'; v_vals := v_vals || ', ' || quote_literal(j.zalo_url);
    END IF;

    EXECUTE 'INSERT INTO public.posts (' || v_cols || ') VALUES (' || v_vals || ') RETURNING id'
      INTO v_id USING t.account_id, trim(v_body);
  ELSE
    IF t.post_id IS NULL THEN RAISE EXCEPTION 'Thiếu bài viết để bình luận'; END IF;
    IF nullif(trim(v_body),'') IS NULL THEN RAISE EXCEPTION 'Nội dung bình luận trống'; END IF;
    INSERT INTO public.comments (post_id, user_id, content)
    VALUES (t.post_id, t.account_id, trim(v_body))
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.scheduled_tasks
     SET status='done', finished_at=now(), result_id=v_id, error=NULL
   WHERE id = t.id;
END $fn$;

-- ---------------------------------------------------------------------
-- 5) Bộ chạy: pg_cron gọi mỗi phút
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scheduler_run_due(p_limit int DEFAULT 200)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; done int := 0; v_next timestamptz; v_fail int;
BEGIN
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

  RETURN done;
END $fn$;

-- ---------------------------------------------------------------------
-- 6) RPC cho Admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scheduler_create(
  p_kind text,
  p_accounts uuid[],
  p_run_at timestamptz,
  p_content text DEFAULT NULL,
  p_image_urls text[] DEFAULT NULL,
  p_gif_url text DEFAULT NULL,
  p_voice_token text DEFAULT NULL,
  p_facebook_url text DEFAULT NULL,
  p_zalo_url text DEFAULT NULL,
  p_post_ids uuid[] DEFAULT NULL,
  p_stagger_minutes int DEFAULT 0,
  p_recurrence text DEFAULT 'none',
  p_recur_interval_minutes int DEFAULT NULL,
  p_recur_time time DEFAULT NULL,
  p_recur_days int[] DEFAULT NULL,
  p_recur_until timestamptz DEFAULT NULL,
  p_title text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(p_accounts,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn tài khoản' USING ERRCODE='22023';
  END IF;
  IF p_kind = 'comment' AND coalesce(array_length(p_post_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn bài viết' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.scheduled_jobs (
    kind, created_by, title, content, image_urls, gif_url, voice_token,
    facebook_url, zalo_url, account_ids, post_ids, run_at, stagger_minutes,
    recurrence, recur_interval_minutes, recur_time, recur_days, recur_until
  ) VALUES (
    p_kind, auth.uid(), p_title, p_content, p_image_urls, p_gif_url, p_voice_token,
    p_facebook_url, p_zalo_url, p_accounts, coalesce(p_post_ids,'{}'::uuid[]),
    greatest(p_run_at, now()), greatest(coalesce(p_stagger_minutes,0),0),
    coalesce(p_recurrence,'none'), p_recur_interval_minutes, p_recur_time, p_recur_days, p_recur_until
  ) RETURNING id INTO v_id;

  PERFORM public._scheduler_build_tasks(v_id);
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scheduler_list(p_status text DEFAULT NULL)
RETURNS TABLE (
  job_id uuid, kind text, status text, title text, content text,
  image_urls text[], gif_url text, voice_token text, facebook_url text, zalo_url text,
  account_ids uuid[], post_ids uuid[], run_at timestamptz, stagger_minutes int,
  recurrence text, recur_interval_minutes int, recur_time time, recur_days int[],
  recur_until timestamptz, runs_count int, last_error text, created_at timestamptz,
  accounts jsonb, pending_count int, done_count int, failed_count int, next_task_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT j.id, j.kind, j.status, j.title, j.content,
         j.image_urls, j.gif_url, j.voice_token, j.facebook_url, j.zalo_url,
         j.account_ids, j.post_ids, j.run_at, j.stagger_minutes,
         j.recurrence, j.recur_interval_minutes, j.recur_time, j.recur_days,
         j.recur_until, j.runs_count, j.last_error, j.created_at,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'username', pr.username, 'full_name', pr.full_name))
             FROM public.profiles pr WHERE pr.id = ANY (j.account_ids)
         ), '[]'::jsonb),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='pending'),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='done'),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='failed'),
         (SELECT min(t.run_at) FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='pending')
    FROM public.scheduled_jobs j
   WHERE (p_status IS NULL OR j.status = p_status)
     AND (p_status IS NOT NULL OR j.status IN ('pending','running','paused','failed'))
   ORDER BY j.run_at ASC;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scheduler_history(p_limit int DEFAULT 200)
RETURNS TABLE (
  task_id uuid, job_id uuid, kind text, account_id uuid, username text, full_name text,
  post_id uuid, content text, run_at timestamptz, started_at timestamptz,
  finished_at timestamptz, status text, error text, result_id uuid
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id, t.job_id, j.kind, t.account_id, pr.username, pr.full_name,
         t.post_id, t.content, t.run_at, t.started_at, t.finished_at, t.status, t.error, t.result_id
    FROM public.scheduled_tasks t
    JOIN public.scheduled_jobs j ON j.id = t.job_id
    LEFT JOIN public.profiles pr ON pr.id = t.account_id
   WHERE t.status IN ('done','failed','cancelled')
   ORDER BY coalesce(t.finished_at, t.run_at) DESC
   LIMIT greatest(coalesce(p_limit,200),1);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scheduler_update(
  p_job uuid,
  p_run_at timestamptz DEFAULT NULL,
  p_content text DEFAULT NULL,
  p_image_urls text[] DEFAULT NULL,
  p_gif_url text DEFAULT NULL,
  p_voice_token text DEFAULT NULL,
  p_facebook_url text DEFAULT NULL,
  p_zalo_url text DEFAULT NULL,
  p_accounts uuid[] DEFAULT NULL,
  p_post_ids uuid[] DEFAULT NULL,
  p_stagger_minutes int DEFAULT NULL,
  p_recurrence text DEFAULT NULL,
  p_recur_interval_minutes int DEFAULT NULL,
  p_recur_time time DEFAULT NULL,
  p_recur_days int[] DEFAULT NULL,
  p_recur_until timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE j public.scheduled_jobs;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO j FROM public.scheduled_jobs WHERE id = p_job FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lịch' USING ERRCODE='P0002'; END IF;
  IF j.status IN ('done','cancelled') THEN
    RAISE EXCEPTION 'Lịch đã kết thúc, không thể sửa' USING ERRCODE='22023';
  END IF;

  UPDATE public.scheduled_jobs SET
    run_at         = greatest(coalesce(p_run_at, run_at), now()),
    content        = coalesce(p_content, content),
    image_urls     = coalesce(p_image_urls, image_urls),
    gif_url        = p_gif_url,
    voice_token    = p_voice_token,
    facebook_url   = p_facebook_url,
    zalo_url       = p_zalo_url,
    account_ids    = coalesce(p_accounts, account_ids),
    post_ids       = coalesce(p_post_ids, post_ids),
    stagger_minutes= coalesce(p_stagger_minutes, stagger_minutes),
    recurrence     = coalesce(p_recurrence, recurrence),
    recur_interval_minutes = coalesce(p_recur_interval_minutes, recur_interval_minutes),
    recur_time     = coalesce(p_recur_time, recur_time),
    recur_days     = coalesce(p_recur_days, recur_days),
    recur_until    = coalesce(p_recur_until, recur_until),
    status         = CASE WHEN status = 'failed' THEN 'pending' ELSE status END,
    updated_at     = now()
  WHERE id = p_job;

  -- Dựng lại các task chưa chạy theo cấu hình mới (giữ nguyên lịch sử đã chạy)
  DELETE FROM public.scheduled_tasks WHERE job_id = p_job AND status = 'pending';
  PERFORM public._scheduler_build_tasks(p_job);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scheduler_set_status(p_job uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('pending','paused','cancelled') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ' USING ERRCODE='22023';
  END IF;
  UPDATE public.scheduled_jobs SET status = p_status, updated_at = now() WHERE id = p_job;
  IF p_status = 'cancelled' THEN
    UPDATE public.scheduled_tasks SET status='cancelled', finished_at=now()
     WHERE job_id = p_job AND status = 'pending';
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scheduler_delete(p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scheduled_jobs WHERE id = p_job;
END $fn$;

REVOKE ALL ON FUNCTION public.scheduler_run_due(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_scheduler_create(text,uuid[],timestamptz,text,text[],text,text,text,text,uuid[],int,text,int,time,int[],timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_scheduler_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_scheduler_history(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_scheduler_update(uuid,timestamptz,text,text[],text,text,text,text,uuid[],uuid[],int,text,int,time,int[],timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_scheduler_set_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_scheduler_delete(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) pg_cron: chạy mỗi phút
-- ---------------------------------------------------------------------
-- Chỉ tạo/refresh scheduler job. Nếu 'scheduler-run-due' đã tồn tại thì
-- unschedule rồi schedule lại. Không đụng vào grant/revoke của pg_cron.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduler-run-due') THEN
    PERFORM cron.unschedule('scheduler-run-due');
  END IF;

  PERFORM cron.schedule(
    'scheduler-run-due',
    '* * * * *',
    $cron$SELECT public.scheduler_run_due(500);$cron$
  );
END $do$;

NOTIFY pgrst, 'reload schema';
