-- =====================================================================
-- KỊCH BẢN (Scenario Engine) — thay thế hoàn toàn "Đăng theo lịch" cũ
-- Chạy 1 lần trong Supabase SQL Editor (project zbuwddjcqdlyijcunwgd).
-- Yêu cầu: đã chạy docs/sql/2026-08-17_SCHEDULER.sql (bảng scheduled_jobs /
-- scheduled_tasks + pg_cron gọi public.scheduler_run_due() mỗi phút).
--
-- Ý tưởng:
--   • Admin tạo nhiều "kịch bản" (mỗi kịch bản = nhiều caption).
--   • Mỗi THỨ trong tuần gắn 1 kịch bản + số clone + số nam/nữ + khung giờ.
--   • Bấm "Chạy": hệ thống tự chọn clone theo giới tính, tự chia thời gian
--     trong 24 giờ kể từ lúc bấm, mỗi clone 1 caption ngẫu nhiên không trùng.
--   • Sau khi tạo, admin chỉ chỉnh Caption / Ảnh / GIF / VIP GIF / Voice của
--     từng dòng clone (task) nếu muốn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Bổ sung cột: media theo TỪNG TASK (mỗi clone một nội dung riêng)
-- ---------------------------------------------------------------------
ALTER TABLE public.scheduled_tasks
  ADD COLUMN IF NOT EXISTS image_urls  text[],
  ADD COLUMN IF NOT EXISTS gif_url     text,
  ADD COLUMN IF NOT EXISTS voice_token text;

ALTER TABLE public.scheduled_jobs
  ADD COLUMN IF NOT EXISTS scenario_id uuid,
  ADD COLUMN IF NOT EXISTS weekday     int;

-- ---------------------------------------------------------------------
-- 1) Bảng kịch bản
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenarios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('post','comment')),
  name       text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scenario_captions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  content     text NOT NULL,
  sort        int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scenario_captions_sid_idx ON public.scenario_captions (scenario_id, sort);

-- Cấu hình theo THỨ (0=CN .. 6=T7) cho từng loại kịch bản
CREATE TABLE IF NOT EXISTS public.scenario_days (
  kind          text NOT NULL CHECK (kind IN ('post','comment')),
  weekday       int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  scenario_id   uuid REFERENCES public.scenarios(id) ON DELETE SET NULL,
  clone_count   int  NOT NULL DEFAULT 20,
  female_count  int  NOT NULL DEFAULT 0,
  male_count    int  NOT NULL DEFAULT 0,
  times         time[] NOT NULL DEFAULT '{}',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, weekday)
);

ALTER TABLE public.scenarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_captions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_days     ENABLE ROW LEVEL SECURITY;
-- Không policy: chỉ truy cập qua RPC SECURITY DEFINER bên dưới.
GRANT ALL ON public.scenarios, public.scenario_captions, public.scenario_days TO service_role;

-- Seed mặc định số clone / khung giờ theo yêu cầu vận hành
INSERT INTO public.scenario_days (kind, weekday, clone_count, female_count, male_count, times) VALUES
  ('post', 1, 20, 15, 5,  '{09:00,10:20,11:45,13:30,15:10,17:40,20:00,22:00}'::time[]),
  ('post', 2, 30, 20, 10, '{08:30,10:00,11:30,13:00,15:00,17:00,19:30,21:30}'::time[]),
  ('post', 3, 40, 25, 15, '{08:00,09:30,11:00,13:00,15:00,17:00,19:00,21:00,23:00}'::time[]),
  ('post', 4, 45, 30, 15, '{08:00,09:30,11:00,13:00,15:00,17:00,19:00,21:00,23:00}'::time[]),
  ('post', 5, 58, 38, 20, '{08:00,09:00,10:00,11:00,13:00,15:00,18:00,20:00,22:00,23:30}'::time[]),
  ('post', 6, 64, 40, 24, '{08:00,09:00,10:00,11:00,13:00,15:00,18:00,20:00,22:00,23:30}'::time[]),
  ('post', 0, 78, 50, 28, '{07:30,09:00,10:30,12:00,14:00,16:00,18:00,20:00,22:00,23:30}'::time[])
ON CONFLICT (kind, weekday) DO NOTHING;

INSERT INTO public.scenario_days (kind, weekday, clone_count, female_count, male_count, times)
SELECT 'comment', weekday, clone_count, female_count, male_count, times
  FROM public.scenario_days WHERE kind = 'post'
ON CONFLICT (kind, weekday) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) Thực thi task: ƯU TIÊN media của TASK, fallback về job
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._scheduler_exec_task(p_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t public.scheduled_tasks; j public.scheduled_jobs;
  v_id uuid; v_imgs text[]; v_body text; v_cols text; v_vals text;
  v_gif text; v_voice text;
BEGIN
  SELECT * INTO t FROM public.scheduled_tasks WHERE id = p_task;
  SELECT * INTO j FROM public.scheduled_jobs  WHERE id = t.job_id;

  v_gif   := coalesce(t.gif_url, j.gif_url);
  v_voice := coalesce(t.voice_token, j.voice_token);
  v_imgs  := coalesce(t.image_urls, j.image_urls, '{}'::text[]);

  v_body := coalesce(nullif(trim(coalesce(t.content,'')),''), '');
  IF v_gif IS NOT NULL THEN
    v_body := btrim(v_body || E'\n' || '[[gif:' || v_gif || ']]', E'\n');
  END IF;
  IF v_voice IS NOT NULL THEN
    v_body := btrim(v_body || E'\n' || v_voice, E'\n');
  END IF;

  IF j.kind = 'post' THEN
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
-- 3) RPC: quản lý kịch bản
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scenario_list(p_kind text)
RETURNS TABLE (id uuid, kind text, name text, caption_count int, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT s.id, s.kind, s.name,
         (SELECT count(*)::int FROM public.scenario_captions c WHERE c.scenario_id = s.id),
         s.created_at
    FROM public.scenarios s
   WHERE s.kind = p_kind
   ORDER BY s.created_at;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_create(p_kind text, p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('post','comment') THEN RAISE EXCEPTION 'kind không hợp lệ'; END IF;
  INSERT INTO public.scenarios (kind, name, created_by)
  VALUES (p_kind, coalesce(nullif(trim(p_name),''), 'Kịch bản mới'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_rename(p_id uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.scenarios SET name = coalesce(nullif(trim(p_name),''), name) WHERE id = p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scenarios WHERE id = p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_captions(p_scenario uuid)
RETURNS TABLE (id uuid, content text, sort int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT c.id, c.content, c.sort FROM public.scenario_captions c
   WHERE c.scenario_id = p_scenario ORDER BY c.sort, c.created_at;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_set_captions(p_scenario uuid, p_contents text[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE i int := 0; v text; n int := 0;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scenario_captions WHERE scenario_id = p_scenario;
  FOREACH v IN ARRAY coalesce(p_contents, '{}'::text[]) LOOP
    IF nullif(trim(v),'') IS NOT NULL THEN
      INSERT INTO public.scenario_captions (scenario_id, content, sort) VALUES (p_scenario, trim(v), i);
      n := n + 1;
    END IF;
    i := i + 1;
  END LOOP;
  RETURN n;
END $fn$;

-- ---------------------------------------------------------------------
-- 4) RPC: cấu hình theo THỨ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scenario_days(p_kind text)
RETURNS TABLE (weekday int, scenario_id uuid, scenario_name text,
               clone_count int, female_count int, male_count int, times text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT d.weekday, d.scenario_id, s.name, d.clone_count, d.female_count, d.male_count,
         (SELECT array_agg(to_char(t, 'HH24:MI') ORDER BY t) FROM unnest(d.times) AS t)
    FROM public.scenario_days d
    LEFT JOIN public.scenarios s ON s.id = d.scenario_id
   WHERE d.kind = p_kind
   ORDER BY d.weekday;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_day_save(
  p_kind text, p_weekday int, p_scenario uuid,
  p_clone_count int, p_female int, p_male int, p_times text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_times time[];
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(x::time ORDER BY x::time), '{}'::time[]) INTO v_times
    FROM unnest(coalesce(p_times,'{}'::text[])) AS x
   WHERE nullif(trim(x),'') IS NOT NULL;

  INSERT INTO public.scenario_days (kind, weekday, scenario_id, clone_count, female_count, male_count, times, updated_at)
  VALUES (p_kind, p_weekday, p_scenario, greatest(coalesce(p_clone_count,0),0),
          greatest(coalesce(p_female,0),0), greatest(coalesce(p_male,0),0), v_times, now())
  ON CONFLICT (kind, weekday) DO UPDATE
     SET scenario_id = EXCLUDED.scenario_id,
         clone_count = EXCLUDED.clone_count,
         female_count = EXCLUDED.female_count,
         male_count = EXCLUDED.male_count,
         times = EXCLUDED.times,
         updated_at = now();
END $fn$;

-- ---------------------------------------------------------------------
-- 5) RPC: CHẠY kịch bản của một THỨ
--    • chọn clone theo giới tính (ngẫu nhiên)
--    • chia đều thời gian trong 24 giờ kể từ p_start, bám khung giờ của thứ đó
--    • mỗi clone lấy 1 caption ngẫu nhiên, không trùng khi còn caption
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scenario_run(
  p_kind text,
  p_weekday int,
  p_start timestamptz DEFAULT now(),
  p_post_ids uuid[] DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  d public.scenario_days;
  v_job uuid;
  v_caps text[];
  v_accounts uuid[];
  v_slots timestamptz[] := '{}';
  v_start timestamptz := greatest(coalesce(p_start, now()), now());
  v_end   timestamptz;
  n int; i int; t timestamptz; v_time time; v_at timestamptz;
  v_cap text; v_pid uuid;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM public.scenario_days WHERE kind = p_kind AND weekday = p_weekday;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chưa cấu hình thứ này' USING ERRCODE='22023'; END IF;
  IF d.scenario_id IS NULL THEN RAISE EXCEPTION 'Chưa chọn kịch bản cho thứ này' USING ERRCODE='22023'; END IF;
  IF p_kind = 'comment' AND coalesce(array_length(p_post_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn bài viết để bình luận' USING ERRCODE='22023';
  END IF;

  v_end := v_start + interval '24 hours';

  -- Caption của kịch bản (xáo trộn)
  SELECT coalesce(array_agg(c.content ORDER BY random()), '{}'::text[]) INTO v_caps
    FROM public.scenario_captions c WHERE c.scenario_id = d.scenario_id;
  IF coalesce(array_length(v_caps,1),0) = 0 THEN
    RAISE EXCEPTION 'Kịch bản chưa có caption nào' USING ERRCODE='22023';
  END IF;

  -- Chọn clone theo giới tính; nếu tổng nam+nữ = 0 thì lấy clone_count bất kỳ
  IF coalesce(d.female_count,0) + coalesce(d.male_count,0) > 0 THEN
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_accounts FROM (
      (SELECT p.id FROM public.profiles p
        WHERE p.account_source='internal' AND coalesce(p.is_banned,false)=false AND p.gender='female'
        ORDER BY random() LIMIT greatest(coalesce(d.female_count,0),0))
      UNION ALL
      (SELECT p.id FROM public.profiles p
        WHERE p.account_source='internal' AND coalesce(p.is_banned,false)=false AND p.gender='male'
        ORDER BY random() LIMIT greatest(coalesce(d.male_count,0),0))
    ) q;
  ELSE
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_accounts FROM (
      SELECT p.id FROM public.profiles p
       WHERE p.account_source='internal' AND coalesce(p.is_banned,false)=false
       ORDER BY random() LIMIT greatest(coalesce(d.clone_count,0),1)
    ) q;
  END IF;

  n := coalesce(array_length(v_accounts,1),0);
  IF n = 0 THEN RAISE EXCEPTION 'Không tìm thấy clone phù hợp' USING ERRCODE='22023'; END IF;

  -- Danh sách mốc giờ khả dụng trong 24h (theo Time Profile của thứ)
  IF coalesce(array_length(d.times,1),0) > 0 THEN
    FOREACH v_time IN ARRAY d.times LOOP
      v_at := date_trunc('day', v_start) + v_time;
      IF v_at < v_start THEN v_at := v_at + interval '1 day'; END IF;
      IF v_at < v_end THEN v_slots := v_slots || v_at; END IF;
    END LOOP;
  END IF;

  INSERT INTO public.scheduled_jobs (kind, created_by, title, account_ids, post_ids, run_at,
                                     stagger_minutes, recurrence, scenario_id, weekday, status)
  VALUES (p_kind, auth.uid(),
          (SELECT name FROM public.scenarios WHERE id = d.scenario_id) || ' · ' ||
          to_char(v_start, 'DD/MM/YYYY HH24:MI'),
          v_accounts, coalesce(p_post_ids, '{}'::uuid[]), v_start,
          0, 'none', d.scenario_id, p_weekday, 'pending')
  RETURNING id INTO v_job;

  FOR i IN 1..n LOOP
    IF coalesce(array_length(v_slots,1),0) > 0 THEN
      -- Bám khung giờ, vòng lại và cộng lệch ngẫu nhiên để không đăng trùng giờ
      t := v_slots[((i - 1) % array_length(v_slots,1)) + 1]
           + make_interval(mins => ((i - 1) / array_length(v_slots,1)) * 7 + floor(random() * 5)::int);
    ELSE
      -- Không có khung giờ: chia đều tuyệt đối trong 24 giờ
      t := v_start + ((v_end - v_start) * (i - 1) / n);
    END IF;
    IF t < now() THEN t := now() + interval '1 minute'; END IF;
    IF t > v_end THEN t := v_end - interval '1 minute'; END IF;

    v_cap := v_caps[((i - 1) % array_length(v_caps,1)) + 1];

    IF p_kind = 'post' THEN
      INSERT INTO public.scheduled_tasks (job_id, account_id, content, run_at)
      VALUES (v_job, v_accounts[i], v_cap, t);
    ELSE
      v_pid := p_post_ids[((i - 1) % array_length(p_post_ids,1)) + 1];
      INSERT INTO public.scheduled_tasks (job_id, account_id, post_id, content, run_at)
      VALUES (v_job, v_accounts[i], v_pid, v_cap, t);
    END IF;
  END LOOP;

  UPDATE public.scheduled_jobs SET next_run_at = v_start WHERE id = v_job;
  RETURN v_job;
END $fn$;

-- ---------------------------------------------------------------------
-- 6) RPC: danh sách lượt chạy + danh sách dòng clone + sửa từng dòng
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scenario_runs(p_kind text, p_limit int DEFAULT 20)
RETURNS TABLE (job_id uuid, title text, status text, weekday int, run_at timestamptz,
               total int, pending_count int, done_count int, failed_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT j.id, j.title, j.status, j.weekday, j.run_at,
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='pending'),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='done'),
         (SELECT count(*)::int FROM public.scheduled_tasks t WHERE t.job_id=j.id AND t.status='failed')
    FROM public.scheduled_jobs j
   WHERE j.scenario_id IS NOT NULL AND j.kind = p_kind
   ORDER BY j.created_at DESC
   LIMIT greatest(coalesce(p_limit,20),1);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_tasks(p_job uuid)
RETURNS TABLE (task_id uuid, account_id uuid, username text, full_name text, avatar text,
               gender text, run_at timestamptz, status text, content text,
               image_urls text[], gif_url text, voice_token text, post_id uuid, error text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id, t.account_id, p.username, p.full_name, p.avatar, p.gender,
         t.run_at, t.status, t.content, t.image_urls, t.gif_url, t.voice_token, t.post_id, t.error
    FROM public.scheduled_tasks t
    LEFT JOIN public.profiles p ON p.id = t.account_id
   WHERE t.job_id = p_job
   ORDER BY t.run_at;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_task_update(
  p_task uuid,
  p_content text DEFAULT NULL,
  p_image_urls text[] DEFAULT NULL,
  p_gif_url text DEFAULT NULL,
  p_voice_token text DEFAULT NULL,
  p_run_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.scheduled_tasks
     SET content     = coalesce(p_content, content),
         image_urls  = coalesce(p_image_urls, image_urls),
         gif_url     = p_gif_url,
         voice_token = p_voice_token,
         run_at      = coalesce(p_run_at, run_at)
   WHERE id = p_task AND status = 'pending';
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_task_delete(p_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scheduled_tasks WHERE id = p_task AND status = 'pending';
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_scenario_run_delete(p_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scheduled_jobs WHERE id = p_job AND scenario_id IS NOT NULL;
END $fn$;

-- ---------------------------------------------------------------------
-- 7) Quyền gọi RPC
-- ---------------------------------------------------------------------
DO $g$
DECLARE f text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'admin_scenario%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $g$;
