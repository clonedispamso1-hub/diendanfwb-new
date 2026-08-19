-- =====================================================================
-- KỊCH BẢN UP BÀI — V2 (thay thế hoàn toàn thiết kế cũ)
-- Chạy 1 lần trong Supabase SQL Editor của DB CHÍNH (zbuwddjcqdlyijcunwgd).
-- Yêu cầu đã chạy trước:
--   • docs/sql/2026-08-17_SCHEDULER.sql        (scheduled_jobs / scheduled_tasks + pg_cron)
--   • docs/sql/RUN_NOW_2026-08-19_SCENARIO_ENGINE.sql
--
-- Thay đổi chính so với V1:
--   • Mỗi KỊCH BẢN là 1 nội dung hoàn chỉnh: Tên + Mô tả + Caption + Ảnh +
--     GIF + VIP GIF + Voice (không còn danh sách caption rời).
--   • Số clone mặc định theo THỨ là CỐ ĐỊNH (T2=20 … CN=78), admin không sửa.
--   • Admin TỰ CHỌN clone (hoặc random 15 nữ/5 nam, 15 nam/5 nữ).
--   • Bỏ toàn bộ phần Kịch bản Bình luận ở tầng UI (RPC comment cũ vẫn còn,
--     không dùng tới).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Cột mới
-- ---------------------------------------------------------------------
ALTER TABLE public.scenarios
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS caption     text,
  ADD COLUMN IF NOT EXISTS image_urls  text[],
  ADD COLUMN IF NOT EXISTS gif_url     text,
  ADD COLUMN IF NOT EXISTS vip_gif_url text,
  ADD COLUMN IF NOT EXISTS voice_token text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.scheduled_tasks
  ADD COLUMN IF NOT EXISTS vip_gif_url text;

ALTER TABLE public.scenario_days
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------
-- 2) Số clone mặc định theo thứ — CỐ ĐỊNH, không sửa được từ UI
--    0=CN, 1=T2 … 6=T7
-- ---------------------------------------------------------------------
INSERT INTO public.scenario_days (kind, weekday, clone_count) VALUES
  ('post', 1, 20), ('post', 2, 30), ('post', 3, 40), ('post', 4, 45),
  ('post', 5, 58), ('post', 6, 64), ('post', 0, 78)
ON CONFLICT (kind, weekday) DO UPDATE SET clone_count = EXCLUDED.clone_count;

UPDATE public.scenario_days SET clone_count = CASE weekday
  WHEN 1 THEN 20 WHEN 2 THEN 30 WHEN 3 THEN 40 WHEN 4 THEN 45
  WHEN 5 THEN 58 WHEN 6 THEN 64 ELSE 78 END
WHERE kind = 'post';

-- ---------------------------------------------------------------------
-- 3) Thực thi task — thêm VIP GIF (ưu tiên dữ liệu của task, fallback job)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._scheduler_exec_task(p_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t public.scheduled_tasks; j public.scheduled_jobs;
  v_id uuid; v_imgs text[]; v_body text; v_cols text; v_vals text;
  v_gif text; v_vip text; v_voice text;
BEGIN
  SELECT * INTO t FROM public.scheduled_tasks WHERE id = p_task;
  SELECT * INTO j FROM public.scheduled_jobs  WHERE id = t.job_id;

  v_gif   := coalesce(t.gif_url, j.gif_url);
  v_vip   := t.vip_gif_url;
  v_voice := coalesce(t.voice_token, j.voice_token);
  v_imgs  := coalesce(t.image_urls, j.image_urls, '{}'::text[]);

  v_body := coalesce(nullif(trim(coalesce(t.content,'')),''), '');
  IF v_gif   IS NOT NULL THEN v_body := btrim(v_body || E'\n' || '[[gif:' || v_gif || ']]', E'\n'); END IF;
  IF v_vip   IS NOT NULL THEN v_body := btrim(v_body || E'\n' || '[[gif:' || v_vip || ']]', E'\n'); END IF;
  IF v_voice IS NOT NULL THEN v_body := btrim(v_body || E'\n' || v_voice, E'\n'); END IF;

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

    EXECUTE 'INSERT INTO public.posts (' || v_cols || ') VALUES (' || v_vals || ') RETURNING id'
      INTO v_id USING t.account_id, trim(v_body);
  ELSE
    IF t.post_id IS NULL THEN RAISE EXCEPTION 'Thiếu bài viết để bình luận'; END IF;
    INSERT INTO public.comments (post_id, user_id, content)
    VALUES (t.post_id, t.account_id, trim(v_body)) RETURNING id INTO v_id;
  END IF;

  UPDATE public.scheduled_tasks
     SET status='done', finished_at=now(), result_id=v_id, error=NULL
   WHERE id = t.id;
END $fn$;

-- ---------------------------------------------------------------------
-- 4) CRUD kịch bản (post)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_post_list();
CREATE FUNCTION public.admin_scenario_post_list()
RETURNS TABLE (id uuid, name text, description text, caption text,
               image_urls text[], gif_url text, vip_gif_url text,
               voice_token text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT s.id, s.name, s.description, s.caption, s.image_urls, s.gif_url,
         s.vip_gif_url, s.voice_token, s.created_at
    FROM public.scenarios s
   WHERE s.kind = 'post'
   ORDER BY s.created_at;
END $fn$;

DROP FUNCTION IF EXISTS public.admin_scenario_post_save(uuid, text, text, text, text[], text, text, text);
CREATE FUNCTION public.admin_scenario_post_save(
  p_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_caption text DEFAULT NULL,
  p_image_urls text[] DEFAULT NULL,
  p_gif_url text DEFAULT NULL,
  p_vip_gif_url text DEFAULT NULL,
  p_voice_token text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF nullif(trim(coalesce(p_name,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Thiếu tên kịch bản' USING ERRCODE='22023';
  END IF;
  IF nullif(trim(coalesce(p_caption,'')),'') IS NULL
     AND coalesce(array_length(p_image_urls,1),0) = 0 THEN
    RAISE EXCEPTION 'Kịch bản phải có caption hoặc ảnh' USING ERRCODE='22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.scenarios (kind, name, description, caption, image_urls,
                                  gif_url, vip_gif_url, voice_token, created_by)
    VALUES ('post', trim(p_name), p_description, p_caption,
            coalesce(p_image_urls,'{}'::text[]), p_gif_url, p_vip_gif_url,
            p_voice_token, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.scenarios
       SET name = trim(p_name), description = p_description, caption = p_caption,
           image_urls = coalesce(p_image_urls,'{}'::text[]), gif_url = p_gif_url,
           vip_gif_url = p_vip_gif_url, voice_token = p_voice_token, updated_at = now()
     WHERE id = p_id AND kind = 'post'
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy kịch bản' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN v_id;
END $fn$;

DROP FUNCTION IF EXISTS public.admin_scenario_post_delete_many(uuid[]);
CREATE FUNCTION public.admin_scenario_post_delete_many(p_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scenarios WHERE kind='post' AND id = ANY(coalesce(p_ids,'{}'::uuid[]));
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 5) Cấu hình theo thứ (chỉ chọn kịch bản; clone_count cố định)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_post_days();
CREATE FUNCTION public.admin_scenario_post_days()
RETURNS TABLE (weekday int, clone_count int, scenario_id uuid, scenario_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT d.weekday, d.clone_count, d.scenario_id, s.name
    FROM public.scenario_days d
    LEFT JOIN public.scenarios s ON s.id = d.scenario_id
   WHERE d.kind = 'post'
   ORDER BY d.weekday;
END $fn$;

DROP FUNCTION IF EXISTS public.admin_scenario_post_day_set(int, uuid);
CREATE FUNCTION public.admin_scenario_post_day_set(p_weekday int, p_scenario uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.scenario_days SET scenario_id = p_scenario, updated_at = now()
   WHERE kind = 'post' AND weekday = p_weekday;
END $fn$;

-- ---------------------------------------------------------------------
-- 6) Danh sách clone + random theo giới tính
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_clones(text);
CREATE FUNCTION public.admin_scenario_clones(p_gender text DEFAULT NULL)
RETURNS TABLE (id uuid, username text, full_name text, avatar text, gender text, uid text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar, p.gender,
         coalesce(to_jsonb(p) ->> 'public_id', left(p.id::text, 8)) AS uid
    FROM public.profiles p
   WHERE p.account_source = 'internal'
     AND coalesce(p.is_banned, false) = false
     AND (p_gender IS NULL OR p.gender = p_gender)
   ORDER BY p.username;
END $fn$;

DROP FUNCTION IF EXISTS public.admin_scenario_clone_random(int, int);
CREATE FUNCTION public.admin_scenario_clone_random(p_female int, p_male int)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v uuid[];
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v FROM (
    (SELECT p.id FROM public.profiles p
      WHERE p.account_source='internal' AND coalesce(p.is_banned,false)=false AND p.gender='female'
      ORDER BY random() LIMIT greatest(coalesce(p_female,0),0))
    UNION ALL
    (SELECT p.id FROM public.profiles p
      WHERE p.account_source='internal' AND coalesce(p.is_banned,false)=false AND p.gender='male'
      ORDER BY random() LIMIT greatest(coalesce(p_male,0),0))
  ) q;
  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 7) CHẠY — tạo hàng đợi từ danh sách clone admin đã chọn
--    pg_cron (public.scheduler_run_due) sẽ thực thi; tắt web vẫn chạy.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_post_run(int, uuid, uuid[], timestamptz);
CREATE FUNCTION public.admin_scenario_post_run(
  p_weekday int,
  p_scenario uuid,
  p_account_ids uuid[],
  p_start timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  d public.scenario_days; s public.scenarios;
  v_job uuid; v_ids uuid[]; n int; i int; t timestamptz;
  v_start timestamptz := greatest(coalesce(p_start, now()), now());
  v_end timestamptz; v_valid int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO d FROM public.scenario_days WHERE kind='post' AND weekday = p_weekday;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thứ không hợp lệ' USING ERRCODE='22023'; END IF;

  IF p_scenario IS NULL THEN RAISE EXCEPTION 'Chưa chọn kịch bản' USING ERRCODE='22023'; END IF;
  SELECT * INTO s FROM public.scenarios WHERE id = p_scenario AND kind='post';
  IF NOT FOUND THEN RAISE EXCEPTION 'Kịch bản không tồn tại' USING ERRCODE='22023'; END IF;
  IF nullif(trim(coalesce(s.caption,'')),'') IS NULL
     AND coalesce(array_length(s.image_urls,1),0) = 0 THEN
    RAISE EXCEPTION 'Kịch bản thiếu caption' USING ERRCODE='22023';
  END IF;

  -- Loại trùng, giữ nguyên thứ tự admin chọn
  SELECT coalesce(array_agg(x ORDER BY ord), '{}'::uuid[]) INTO v_ids
    FROM (SELECT DISTINCT ON (x) x, ord
            FROM unnest(coalesce(p_account_ids,'{}'::uuid[])) WITH ORDINALITY AS u(x, ord)
           ORDER BY x, ord) q;

  n := coalesce(array_length(v_ids,1),0);
  IF n = 0 THEN RAISE EXCEPTION 'Chưa chọn clone nào' USING ERRCODE='22023'; END IF;
  IF n <> coalesce(array_length(p_account_ids,1),0) THEN
    RAISE EXCEPTION 'Danh sách clone bị trùng nhau' USING ERRCODE='22023';
  END IF;
  IF n > d.clone_count THEN
    RAISE EXCEPTION 'Vượt quá số clone cho phép của thứ này (tối đa %)', d.clone_count USING ERRCODE='22023';
  END IF;

  SELECT count(*)::int INTO v_valid FROM public.profiles p
   WHERE p.id = ANY(v_ids) AND p.account_source='internal' AND coalesce(p.is_banned,false)=false;
  IF v_valid <> n THEN
    RAISE EXCEPTION 'Có clone không hợp lệ hoặc đã bị khoá' USING ERRCODE='22023';
  END IF;

  v_end := v_start + interval '24 hours';

  INSERT INTO public.scheduled_jobs (kind, created_by, title, account_ids, post_ids, run_at,
                                     stagger_minutes, recurrence, scenario_id, weekday, status)
  VALUES ('post', auth.uid(), s.name || ' · ' || to_char(v_start,'DD/MM/YYYY HH24:MI'),
          v_ids, '{}'::uuid[], v_start, 0, 'none', s.id, p_weekday, 'pending')
  RETURNING id INTO v_job;

  FOR i IN 1..n LOOP
    t := v_start + ((v_end - v_start) * (i - 1) / n) + make_interval(mins => floor(random()*3)::int);
    IF t < now() THEN t := now() + interval '1 minute'; END IF;
    IF t > v_end THEN t := v_end - interval '1 minute'; END IF;

    INSERT INTO public.scheduled_tasks (job_id, account_id, content, run_at,
                                        image_urls, gif_url, vip_gif_url, voice_token)
    VALUES (v_job, v_ids[i], s.caption, t,
            coalesce(s.image_urls,'{}'::text[]), s.gif_url, s.vip_gif_url, s.voice_token);
  END LOOP;

  UPDATE public.scheduled_jobs SET next_run_at = v_start WHERE id = v_job;
  RETURN v_job;
END $fn$;

-- ---------------------------------------------------------------------
-- 8) Hàng đợi: xem / sửa / xoá
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_tasks(uuid);
CREATE FUNCTION public.admin_scenario_tasks(p_job uuid)
RETURNS TABLE (task_id uuid, account_id uuid, username text, full_name text, avatar text,
               gender text, run_at timestamptz, status text, content text,
               image_urls text[], gif_url text, vip_gif_url text, voice_token text,
               post_id uuid, error text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id, t.account_id, p.username, p.full_name, p.avatar, p.gender,
         t.run_at, t.status, t.content, t.image_urls, t.gif_url, t.vip_gif_url,
         t.voice_token, t.post_id, t.error
    FROM public.scheduled_tasks t
    LEFT JOIN public.profiles p ON p.id = t.account_id
   WHERE t.job_id = p_job
   ORDER BY t.run_at;
END $fn$;

DROP FUNCTION IF EXISTS public.admin_scenario_task_update(uuid, text, text[], text, text, timestamptz);
DROP FUNCTION IF EXISTS public.admin_scenario_task_update(uuid, text, text[], text, text, text, timestamptz);
CREATE FUNCTION public.admin_scenario_task_update(
  p_task uuid,
  p_content text DEFAULT NULL,
  p_image_urls text[] DEFAULT NULL,
  p_gif_url text DEFAULT NULL,
  p_vip_gif_url text DEFAULT NULL,
  p_voice_token text DEFAULT NULL,
  p_run_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.scheduled_tasks
     SET content     = coalesce(p_content, content),
         image_urls  = coalesce(p_image_urls, image_urls),
         gif_url     = p_gif_url,
         vip_gif_url = p_vip_gif_url,
         voice_token = p_voice_token,
         run_at      = coalesce(p_run_at, run_at)
   WHERE id = p_task AND status = 'pending';
END $fn$;

-- Xoá 1 clone khỏi hàng đợi (chỉ khi chưa chạy)
CREATE OR REPLACE FUNCTION public.admin_scenario_task_delete(p_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scheduled_tasks WHERE id = p_task AND status = 'pending';
END $fn$;

-- Xoá toàn bộ bài đang chờ (mọi lượt chạy)
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
  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 9) Quyền gọi RPC
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

-- =====================================================================
-- XONG. Kiểm tra nhanh:
--   SELECT weekday, clone_count FROM public.scenario_days WHERE kind='post' ORDER BY weekday;
--   SELECT * FROM cron.job;   -- phải có job gọi public.scheduler_run_due()
-- =====================================================================
