-- =====================================================================
-- KỊCH BẢN BÌNH LUẬN — V3 (thay thế hoàn toàn V2)
-- Chạy 1 lần trong Supabase SQL Editor của DB CHÍNH (zbuwddjcqdlyijcunwgd).
-- Yêu cầu đã chạy trước:
--   • docs/sql/2026-08-17_SCHEDULER.sql (hoặc _PGCRON_SAFE)
--   • docs/sql/RUN_NOW_2026-08-19_SCENARIO_ENGINE.sql
--   • docs/sql/RUN_NOW_2026-08-19_SCENARIO_POST_V2.sql
--
-- Thay đổi so với V2:
--   1. KHÔNG BAO GIỜ báo "Job này không còn bài nào để bình luận".
--      Nếu scheduled_tasks chưa sinh → lấy danh sách clone từ scheduled_jobs.account_ids
--      (slot ảo). Khi scheduled_tasks được sinh, scenario_comment_tick() tự map sang.
--   2. Chỉ còn 2 chế độ nội dung: BOT COMMENT (text) hoặc GIF THƯỜNG (gif_library).
--      Bỏ hoàn toàn GIF VIP và Icon %.
--   3. Chia clone comment vào bài theo ROUND ROBIN (không random bừa).
--   4. Thư viện bot comment ~900 câu, sinh 1 lần, dùng chung, random khi dùng.
--   5. Không trùng nội dung trong 30 comment liên tiếp; hết thư viện thì shuffle lại.
--   6. Clone không bao giờ comment vào bài của chính nó.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Thư viện câu bot comment
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_comment_texts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content    text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scenario_comment_texts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.scenario_comment_texts TO service_role;

-- Dọn câu trùng cũ rồi khoá duy nhất
DELETE FROM public.scenario_comment_texts a
 USING public.scenario_comment_texts b
 WHERE a.ctid > b.ctid AND btrim(a.content) = btrim(b.content);
CREATE UNIQUE INDEX IF NOT EXISTS scenario_comment_texts_uniq
  ON public.scenario_comment_texts (content);

-- Seed thư viện bot (~900 câu, chỉ chạy nếu thư viện còn ít hơn 300 câu)
DO $seed$
DECLARE
  base text[] := ARRAY[
    'Tương tác nha','Hello','Xin chào','Ngon','Đẹp quá','Kết bạn zalo nha','Cho mình làm quen',
    'Theo dõi mình nha','Dễ thương','Xinh quá','Bạn tên gì','Ủng hộ nhau nha','Follow mình nha',
    'Chúc bạn ngày mới vui vẻ','Nhìn cưng ghê','Chất lượng','Quá đỉnh','Xịn sò','Tuyệt vời',
    'Ảnh đẹp ghê','Góc chụp đẹp','Nụ cười tươi quá','Thần thái quá','Cuốn thật sự','Yêu thích',
    'Đỉnh của chóp','Hay quá','Mê luôn','Thích cái này','Đúng gu mình rồi','Quá ưng','Ngầu quá',
    'Cute xỉu','Xinh xắn ghê','Nhìn thân thiện quá','Bạn vui tính nhỉ','Vibe dễ chịu ghê',
    'Bạn ở đâu vậy','Làm quen được không','Kết bạn nha','Add friend nha','Giao lưu nha',
    'Qua nhà mình chơi nha','Ghé nhà mình với','Ủng hộ bạn nè','Mình vừa follow bạn',
    'Follow lại mình nha','Hóng bài tiếp theo','Chờ bài mới của bạn','Đăng nữa đi bạn',
    'Content chất lượng','Chúc bạn buổi sáng vui','Chúc bạn buổi tối an lành',
    'Chúc bạn ngủ ngon','Chúc bạn nhiều sức khoẻ','Chúc bạn thật nhiều niềm vui',
    'Ngày mới tốt lành','Cuối tuần vui vẻ','Vui vẻ nha bạn','Cố lên nha','Giỏi quá',
    'Quá tuyệt','Perfect','Nice','Good','Xuất sắc','Số một luôn','Đẳng cấp','Không có gì để chê',
    'Ưng cái bụng','Nhìn là mê','Chuẩn không cần chỉnh','Hết nước chấm','Chill thật sự',
    'Nhìn vui ghê','Cười tươi quá','Yêu quá đi','Thương ghê','Dễ mến ghê','Duyên quá',
    'Nhìn sang ghê','Style đẹp đó','Outfit xịn','Phối đồ đẹp','Tóc đẹp quá','Da đẹp ghê',
    'Chụp có tâm ghê','Máy gì chụp đẹp vậy','Ở đâu đẹp vậy bạn','Chỗ này đẹp ghê',
    'Cho mình xin info','Cho hỏi chỗ này ở đâu','Bạn làm nghề gì vậy','Bao nhiêu tuổi rồi bạn',
    'Rảnh không tám chút','Nói chuyện với mình nha','Nhắn tin cho mình nha','Inbox mình nha',
    'Mình mới tham gia nè','Chào cả nhà','Chào mọi người','Có ai như mình không',
    'Đồng ý luôn','Chuẩn rồi đó','Quá đúng','Ủng hộ hai tay','Like mạnh','Like nhẹ phát',
    'Điểm 10 cho chất lượng','Xem hoài không chán','Coi mà mê','Ngắm hoài luôn','Ghen tị ghê',
    'Ước gì được như bạn','Hâm mộ bạn','Bạn dễ thương thật','Bạn thật tuyệt','Quý bạn ghê'
  ];
  suffix text[] := ARRAY['','!',' nha',' nhé',' ạ',' nè',' luôn',' hihi',' ❤️',' 😍',' 👍',' 🔥'];
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.scenario_comment_texts;
  IF n < 300 THEN
    INSERT INTO public.scenario_comment_texts (content)
    SELECT DISTINCT btrim(b.v || s.v)
      FROM unnest(base) AS b(v)
      CROSS JOIN unnest(suffix) AS s(v)
    ON CONFLICT (content) DO NOTHING;
  END IF;
END $seed$;

-- ---------------------------------------------------------------------
-- 2) Cấu hình comment cho 1 Job Up Bài (V3: chỉ còn % GIF)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_comment_configs (
  job_id         uuid PRIMARY KEY REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE,
  total_comments int  NOT NULL DEFAULT 0,
  mode           text NOT NULL DEFAULT 'even',
  pct_gif        int  NOT NULL DEFAULT 0,
  delay_min      int  NOT NULL DEFAULT 2,
  delay_max      int  NOT NULL DEFAULT 5,
  account_mode   text NOT NULL DEFAULT 'random',
  account_ids    uuid[] NOT NULL DEFAULT '{}',
  created_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scenario_comment_configs
  ADD COLUMN IF NOT EXISTS pct_gif int NOT NULL DEFAULT 0;
ALTER TABLE public.scenario_comment_configs
  ALTER COLUMN delay_min SET DEFAULT 2;
-- Bỏ các cột / ràng buộc của V2 (GIF VIP + Icon)
ALTER TABLE public.scenario_comment_configs DROP COLUMN IF EXISTS pct_vip_gif;
ALTER TABLE public.scenario_comment_configs DROP COLUMN IF EXISTS pct_icon;
ALTER TABLE public.scenario_comment_configs DROP COLUMN IF EXISTS pct_text;
ALTER TABLE public.scenario_comment_configs DROP COLUMN IF EXISTS vip_folders;
ALTER TABLE public.scenario_comment_configs DROP COLUMN IF EXISTS icons;
DO $c$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.scenario_comment_configs'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.scenario_comment_configs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $c$;
ALTER TABLE public.scenario_comment_configs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.scenario_comment_configs TO service_role;

-- ---------------------------------------------------------------------
-- 3) Hàng đợi comment
--    post_task_id NULL = chưa map (job chưa sinh scheduled_tasks) → map theo slot_index.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_comment_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES public.scheduled_jobs(id)  ON DELETE CASCADE,
  post_task_id  uuid REFERENCES public.scheduled_tasks(id) ON DELETE CASCADE,
  slot_index    int  NOT NULL DEFAULT 0,
  author_id     uuid,
  account_id    uuid NOT NULL,
  kind          text NOT NULL DEFAULT 'text',
  content       text NOT NULL,
  delay_seconds int  NOT NULL DEFAULT 120,
  post_id       uuid,
  run_at        timestamptz,
  status        text NOT NULL DEFAULT 'waiting',
  error         text,
  result_id     uuid,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scenario_comment_tasks ALTER COLUMN post_task_id DROP NOT NULL;
ALTER TABLE public.scenario_comment_tasks ADD COLUMN IF NOT EXISTS slot_index int NOT NULL DEFAULT 0;
ALTER TABLE public.scenario_comment_tasks ADD COLUMN IF NOT EXISTS author_id uuid;
-- Bỏ CHECK cũ (kind chỉ còn text/gif; status thêm giá trị mới)
DO $c$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.scenario_comment_tasks'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.scenario_comment_tasks DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $c$;
-- Dữ liệu cũ dùng icon / vip_gif → quy về 2 chế độ mới
UPDATE public.scenario_comment_tasks SET kind = 'gif'  WHERE kind = 'vip_gif';
UPDATE public.scenario_comment_tasks SET kind = 'text' WHERE kind NOT IN ('text','gif');
ALTER TABLE public.scenario_comment_tasks
  ADD CONSTRAINT scenario_comment_tasks_kind_ck CHECK (kind IN ('text','gif'));
ALTER TABLE public.scenario_comment_tasks
  ADD CONSTRAINT scenario_comment_tasks_status_ck
  CHECK (status IN ('waiting','pending','done','failed','cancelled'));

CREATE INDEX IF NOT EXISTS scenario_comment_tasks_job_idx  ON public.scenario_comment_tasks (job_id);
CREATE INDEX IF NOT EXISTS scenario_comment_tasks_due_idx  ON public.scenario_comment_tasks (status, run_at);
CREATE INDEX IF NOT EXISTS scenario_comment_tasks_ptid_idx ON public.scenario_comment_tasks (post_task_id);
CREATE INDEX IF NOT EXISTS scenario_comment_tasks_slot_idx ON public.scenario_comment_tasks (job_id, slot_index);
ALTER TABLE public.scenario_comment_tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.scenario_comment_tasks TO service_role;

-- ---------------------------------------------------------------------
-- 4) Danh sách Job Up Bài (post_total không bao giờ = 0 khi job đã chọn clone)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_comment_jobs(int);
CREATE FUNCTION public.admin_scenario_comment_jobs(p_limit int DEFAULT 30)
RETURNS TABLE (job_id uuid, title text, scenario_name text, weekday int, status text,
               run_at timestamptz, clone_count int, post_total int, post_done int,
               cmt_total int, cmt_waiting int, cmt_pending int, cmt_done int, cmt_failed int,
               configured boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT j.id, j.title, s.name, j.weekday, j.status, j.run_at,
         coalesce(array_length(j.account_ids,1),0),
         greatest(
           (SELECT count(*)::int FROM public.scheduled_tasks t
             WHERE t.job_id=j.id AND t.status <> 'cancelled'),
           coalesce(array_length(j.account_ids,1),0)
         ),
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
   ORDER BY j.created_at DESC
   LIMIT greatest(coalesce(p_limit,30),1);
END $fn$;

-- ---------------------------------------------------------------------
-- 5) Thư viện câu comment: list / add / delete
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_comment_text_list();
CREATE FUNCTION public.admin_comment_text_list()
RETURNS TABLE (id uuid, content text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT t.id, t.content, t.created_at
                 FROM public.scenario_comment_texts t ORDER BY t.created_at, t.content;
END $fn$;

DROP FUNCTION IF EXISTS public.admin_comment_text_add(text[]);
CREATE FUNCTION public.admin_comment_text_add(p_items text[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v int := 0; s text;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  FOREACH s IN ARRAY coalesce(p_items,'{}'::text[]) LOOP
    IF nullif(btrim(s),'') IS NOT NULL THEN
      INSERT INTO public.scenario_comment_texts (content, created_by)
      VALUES (btrim(s), auth.uid()) ON CONFLICT (content) DO NOTHING;
      v := v + 1;
    END IF;
  END LOOP;
  RETURN v;
END $fn$;

DROP FUNCTION IF EXISTS public.admin_comment_text_delete(uuid[]);
CREATE FUNCTION public.admin_comment_text_delete(p_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scenario_comment_texts WHERE id = ANY(coalesce(p_ids,'{}'::uuid[]));
  GET DIAGNOSTICS v = ROW_COUNT; RETURN v;
END $fn$;

-- Nguồn nội dung: đếm câu bot + số GIF thường
DROP FUNCTION IF EXISTS public.admin_comment_sources();
CREATE FUNCTION public.admin_comment_sources()
RETURNS TABLE (bot_texts int, gifs int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT (SELECT count(*)::int FROM public.scenario_comment_texts),
         (SELECT count(*)::int FROM public.gif_library WHERE kind IN ('gif','sticker'));
END $fn$;

-- ---------------------------------------------------------------------
-- 6) APPLY — sinh hàng đợi comment cho 1 Job Up Bài
--    KHÔNG bao giờ báo "Job này không còn bài nào để bình luận".
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_comment_apply(
  uuid, int, text, int, int, int, int, text[], text[], int, int, text, uuid[]);
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
  v_tasks uuid[] := '{}'::uuid[];      -- scheduled_tasks.id theo slot (có thể rỗng)
  v_authors uuid[] := '{}'::uuid[];    -- clone đăng bài của slot
  n_slots int;
  v_texts text[]; v_gifs text[]; v_pool uuid[]; n_pool int;
  v_recent text[] := '{}'::text[];     -- 30 nội dung gần nhất (chống trùng)
  v_made int := 0; v_ti int := 0; v_pi int := 0;
  i int; k int; slot int; guard int;
  v_kind text; v_content text; v_acc uuid; v_prev uuid := NULL; v_delay int;
  v_used uuid[];
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO j FROM public.scheduled_jobs WHERE id = p_job AND kind = 'post';
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy Job Up Bài' USING ERRCODE='22023'; END IF;
  IF coalesce(p_total,0) <= 0 THEN RAISE EXCEPTION 'Số comment phải > 0' USING ERRCODE='22023'; END IF;
  IF coalesce(p_delay_min,2) < 0 OR coalesce(p_delay_max,5) < coalesce(p_delay_min,2) THEN
    RAISE EXCEPTION 'Khoảng delay không hợp lệ' USING ERRCODE='22023';
  END IF;

  -- (A) Slot bài: ưu tiên scheduled_tasks; nếu chưa sinh thì dùng clone của job (slot ảo)
  SELECT coalesce(array_agg(t.id ORDER BY t.run_at, t.created_at), '{}'::uuid[]),
         coalesce(array_agg(t.account_id ORDER BY t.run_at, t.created_at), '{}'::uuid[])
    INTO v_tasks, v_authors
    FROM public.scheduled_tasks t
   WHERE t.job_id = p_job AND t.status <> 'cancelled';

  n_slots := coalesce(array_length(v_tasks,1),0);
  IF n_slots = 0 THEN
    v_tasks := '{}'::uuid[];
    SELECT coalesce(array_agg(a), '{}'::uuid[]) INTO v_authors
      FROM unnest(coalesce(j.account_ids,'{}'::uuid[])) AS u(a);
    n_slots := coalesce(array_length(v_authors,1),0);
  END IF;
  IF n_slots = 0 THEN
    RAISE EXCEPTION 'Job Up Bài chưa chọn clone đăng bài nào' USING ERRCODE='22023';
  END IF;

  -- (B) Nguồn nội dung
  SELECT coalesce(array_agg(content ORDER BY random()), '{}'::text[]) INTO v_texts
    FROM public.scenario_comment_texts;
  SELECT coalesce(array_agg(url ORDER BY random()), '{}'::text[]) INTO v_gifs
    FROM public.gif_library WHERE kind IN ('gif','sticker');
  IF coalesce(array_length(v_texts,1),0) = 0 AND coalesce(array_length(v_gifs,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa có câu bot comment và cũng chưa có GIF nào' USING ERRCODE='22023';
  END IF;

  -- (C) Pool clone comment (xáo trộn) — dùng round robin để không dồn vào 1 clone
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

  -- (F) ROUND ROBIN: comment thứ k → slot ((k-1) mod n_slots) + 1  ⇒ chia đều tuyệt đối
  FOR k IN 1..p_total LOOP
    slot := ((k - 1) % n_slots) + 1;

    -- Clone: round robin trên pool, bỏ qua chủ bài, không lặp lại clone liền kề,
    -- và không cho 1 clone comment 2 lần vào cùng 1 bài khi pool còn dư.
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

    -- Nới lỏng dần khi pool nhỏ: chỉ còn ràng buộc "không comment bài của chính mình".
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
    CONTINUE WHEN v_acc IS NULL;   -- chỉ có đúng 1 clone và nó là chủ bài → bỏ qua
    v_prev := v_acc;

    -- Nội dung: GIF thường theo %, còn lại BOT COMMENT
    IF coalesce(array_length(v_gifs,1),0) > 0
       AND (random() * 100) < greatest(least(coalesce(p_pct_gif,0),100),0) THEN
      v_kind := 'gif';
      v_content := '[[gif:' || v_gifs[1 + floor(random()*array_length(v_gifs,1))::int] || ']]';
    ELSE
      v_kind := 'text';
      -- Quay vòng thư viện đã xáo; hết thì shuffle lại; không trùng trong 30 câu gần nhất.
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
    VALUES (p_job,
            CASE WHEN coalesce(array_length(v_tasks,1),0) >= slot THEN v_tasks[slot] ELSE NULL END,
            slot, v_authors[slot], v_acc, v_kind, v_content, greatest(v_delay,10), 'waiting');
    v_made := v_made + 1;
  END LOOP;

  RETURN v_made;
END $fn$;

-- ---------------------------------------------------------------------
-- 7) Xem / xoá hàng đợi comment
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_scenario_comment_tasks(uuid, int);
CREATE FUNCTION public.admin_scenario_comment_tasks(p_job uuid, p_limit int DEFAULT 1000)
RETURNS TABLE (task_id uuid, post_task_id uuid, slot_index int, account_id uuid,
               username text, full_name text, avatar text, gender text,
               kind text, content text, delay_seconds int,
               run_at timestamptz, status text, post_id uuid, error text,
               author_username text, post_run_at timestamptz, post_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
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
  DELETE FROM public.scenario_comment_tasks
   WHERE id = p_task AND status IN ('waiting','pending');
END $fn$;

DROP FUNCTION IF EXISTS public.admin_scenario_comment_clear(uuid);
CREATE FUNCTION public.admin_scenario_comment_clear(p_job uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.scenario_comment_tasks
   WHERE job_id = p_job AND status IN ('waiting','pending');
  GET DIAGNOSTICS v = ROW_COUNT;
  DELETE FROM public.scenario_comment_configs WHERE job_id = p_job;
  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 8) Điều khiển Job Up Bài (comment bám theo)
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
    UPDATE public.scheduled_tasks SET status='cancelled', finished_at=now()
     WHERE job_id = p_job AND status = 'pending';
    UPDATE public.scenario_comment_tasks SET status='cancelled', finished_at=now()
     WHERE job_id = p_job AND status IN ('waiting','pending');
  END IF;
END $fn$;

-- ---------------------------------------------------------------------
-- 9) Bộ chạy comment — gọi bởi scheduler_run_due() (pg_cron mỗi phút)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_comment_tick(p_limit int DEFAULT 200)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; v_id uuid; done int := 0;
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

  -- a2) Clone comment trùng chủ bài sau khi map → đổi sang clone khác
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

  -- e) Chạy các comment tới giờ (job phải đang pending/running)
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
-- 10) scheduler_run_due(): chạy comment + không kết thúc job khi còn comment chờ
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

  PERFORM public.scenario_comment_tick(p_limit);

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
-- 11) Quyền gọi RPC
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
-- XONG. Kiểm tra nhanh:
--   SELECT count(*) FROM public.scenario_comment_texts;   -- ~900 câu bot
--   SELECT public.scenario_comment_tick(50);
-- =====================================================================
