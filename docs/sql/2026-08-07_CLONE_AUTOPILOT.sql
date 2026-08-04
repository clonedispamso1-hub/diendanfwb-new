-- =====================================================================
-- 2026-08-07  CLONE AUTOPILOT + REPLY + FIX FORBIDDEN
-- Chạy 1 lần trong Supabase SQL Editor. Idempotent.
-- KHÔNG tạo project mới, KHÔNG đổi URL/Key, KHÔNG xoá dữ liệu.
--
--   A) FIX "Forbidden": cấp lại EXECUTE cho toàn bộ RPC admin_* + hàm quyền
--   B) Clone trả lời bình luận ngay trong Admin  → admin_internal_reply_comment
--   C) Auto Comment Autopilot chạy nền bằng pg_cron (Admin tắt máy vẫn chạy)
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) FIX FORBIDDEN — 42501 do thiếu GRANT EXECUTE trên RPC admin_*
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'admin\_%' OR p.proname = '_is_super_admin')
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.sig || ' TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.sig || ' TO service_role';
  END LOOP;
END $$;

-- Chẩn đoán nhanh: vì sao tài khoản hiện tại bị Forbidden.
DROP FUNCTION IF EXISTS public.admin_whoami();
CREATE OR REPLACE FUNCTION public.admin_whoami()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'uid', auth.uid(),
    'role', current_setting('request.jwt.claim.role', true),
    'is_super_admin', public._is_super_admin(),
    'profile_is_admin', (SELECT coalesce(is_admin,false) FROM public.profiles WHERE id = auth.uid()),
    'user_roles', (SELECT coalesce(array_agg(role::text), '{}') FROM public.user_roles WHERE user_id = auth.uid())
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_whoami() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_whoami() TO authenticated;

-- ---------------------------------------------------------------------
-- B) CLONE TRẢ LỜI BÌNH LUẬN / BÌNH LUẬN TRỰC TIẾP TRONG POPUP
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_internal_reply_comment(uuid,uuid,text,uuid);
CREATE OR REPLACE FUNCTION public.admin_internal_reply_comment(
  p_account uuid, p_post uuid, p_content text, p_parent uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_txt text := btrim(coalesce(p_content,''));
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF v_txt = '' THEN RAISE EXCEPTION 'Nội dung trống' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_account AND account_source = 'internal') THEN
    RAISE EXCEPTION 'Tài khoản không phải clone' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.comments (post_id, user_id, content, parent_id)
  VALUES (p_post, p_account, v_txt, p_parent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_reply_comment(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_reply_comment(uuid,uuid,text,uuid) TO authenticated;

-- Bình luận kèm parent_id trong danh sách để hiển thị đúng luồng trả lời.
DROP FUNCTION IF EXISTS public.admin_internal_post_comments(uuid,int);
CREATE OR REPLACE FUNCTION public.admin_internal_post_comments(
  p_post uuid, p_limit int DEFAULT 100
) RETURNS TABLE (
  id uuid, content text, created_at timestamptz,
  author_id uuid, author_username text, author_name text, author_avatar text,
  parent_id uuid
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT c.id, c.content, c.created_at, pr.id, pr.username, pr.full_name, pr.avatar, c.parent_id
    FROM public.comments c
    LEFT JOIN public.profiles pr ON pr.id = c.user_id
   WHERE c.post_id = p_post
   ORDER BY c.created_at ASC
   LIMIT greatest(coalesce(p_limit,100),1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_post_comments(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_post_comments(uuid,int) TO authenticated;

-- Lấy 1 bài viết (để mở popup từ thông báo).
DROP FUNCTION IF EXISTS public.admin_internal_get_post(uuid);
CREATE OR REPLACE FUNCTION public.admin_internal_get_post(p_post uuid)
RETURNS TABLE (
  id uuid, content text, created_at timestamptz,
  author_id uuid, author_username text, author_name text, author_avatar text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT po.id, po.content, po.created_at, pr.id, pr.username, pr.full_name, pr.avatar
    FROM public.posts po LEFT JOIN public.profiles pr ON pr.id = po.user_id
   WHERE po.id = p_post;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_get_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_get_post(uuid) TO authenticated;

-- =====================================================================
-- C) AUTO COMMENT AUTOPILOT (chạy nền, không cần Admin mở trình duyệt)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_comment_autopilot (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status        text NOT NULL DEFAULT 'stopped' CHECK (status IN ('stopped','running','paused')),
  modes         text[] NOT NULL DEFAULT ARRAY['text']::text[],   -- text | gif | emoji
  texts         text[] NOT NULL DEFAULT ARRAY[]::text[],
  emojis        text[] NOT NULL DEFAULT ARRAY['😀','😍','🔥','👏','❤️','😂','😮','🥰','👍','✨']::text[],
  range_key     text NOT NULL DEFAULT 'today',                   -- today|yesterday|week|month|custom
  custom_from   timestamptz,
  custom_to     timestamptz,
  min_minutes   int NOT NULL DEFAULT 15,
  max_minutes   int NOT NULL DEFAULT 60,
  per_post_max  int NOT NULL DEFAULT 3,     -- tối đa clone bình luận / bài / vòng
  queue_target  int NOT NULL DEFAULT 40,    -- giữ tối đa bao nhiêu job chờ
  last_tick     timestamptz,
  last_plan     timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.admin_comment_autopilot (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT ALL ON public.admin_comment_autopilot TO service_role;
ALTER TABLE public.admin_comment_autopilot ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_comment_jobs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Khoảng thời gian theo bộ lọc
DROP FUNCTION IF EXISTS public._autopilot_since(public.admin_comment_autopilot);
CREATE OR REPLACE FUNCTION public._autopilot_since(c public.admin_comment_autopilot)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE c.range_key
    WHEN 'today'     THEN date_trunc('day', now())
    WHEN 'yesterday' THEN date_trunc('day', now()) - interval '1 day'
    WHEN 'week'      THEN date_trunc('week', now())
    WHEN 'month'     THEN date_trunc('month', now())
    WHEN 'custom'    THEN c.custom_from
    ELSE NULL END;
$$;

DROP FUNCTION IF EXISTS public._autopilot_until(public.admin_comment_autopilot);
CREATE OR REPLACE FUNCTION public._autopilot_until(c public.admin_comment_autopilot)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE c.range_key
    WHEN 'yesterday' THEN date_trunc('day', now())
    WHEN 'custom'    THEN c.custom_to
    ELSE NULL END;
$$;

-- Sinh 1 nội dung ngẫu nhiên theo mode đã bật
DROP FUNCTION IF EXISTS public._autopilot_pick_content(public.admin_comment_autopilot);
CREATE OR REPLACE FUNCTION public._autopilot_pick_content(c public.admin_comment_autopilot)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE v_modes text[] := c.modes; v_mode text; v_out text; v_url text;
BEGIN
  IF coalesce(array_length(v_modes,1),0) = 0 THEN v_modes := ARRAY['text']; END IF;
  FOR i IN 1..4 LOOP
    v_mode := v_modes[1 + floor(random() * array_length(v_modes,1))::int];
    IF v_mode = 'text' AND coalesce(array_length(c.texts,1),0) > 0 THEN
      v_out := btrim(c.texts[1 + floor(random() * array_length(c.texts,1))::int]);
    ELSIF v_mode = 'emoji' AND coalesce(array_length(c.emojis,1),0) > 0 THEN
      v_out := c.emojis[1 + floor(random() * array_length(c.emojis,1))::int];
    ELSIF v_mode = 'gif' THEN
      BEGIN
        SELECT g.url INTO v_url FROM public.gif_library g
         WHERE g.kind IN ('gif','sticker') ORDER BY random() LIMIT 1;
      EXCEPTION WHEN undefined_table OR undefined_column THEN v_url := NULL; END;
      IF v_url IS NOT NULL THEN v_out := '[[gif:' || v_url || ']]'; END IF;
    END IF;
    IF coalesce(v_out,'') <> '' THEN RETURN v_out; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Lập lịch thêm job (chạy trong tick, không cần quyền admin vì gọi nội bộ/cron)
DROP FUNCTION IF EXISTS public._autopilot_plan(int);
CREATE OR REPLACE FUNCTION public._autopilot_plan(p_limit int DEFAULT 40)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.admin_comment_autopilot%rowtype;
  v_since timestamptz; v_until timestamptz;
  v_pending int; v_need int; made int := 0;
  v_t timestamptz; r record; v_txt text;
BEGIN
  SELECT * INTO c FROM public.admin_comment_autopilot WHERE id = 1;
  IF c.id IS NULL OR c.status <> 'running' THEN RETURN 0; END IF;

  SELECT count(*) INTO v_pending FROM public.admin_comment_jobs
   WHERE status = 'pending' AND source = 'autopilot';
  v_need := least(greatest(c.queue_target - v_pending, 0), greatest(coalesce(p_limit,40),1));
  IF v_need = 0 THEN RETURN 0; END IF;

  v_since := public._autopilot_since(c);
  v_until := public._autopilot_until(c);
  v_t := greatest(now(), coalesce((SELECT max(run_at) FROM public.admin_comment_jobs
                                    WHERE status='pending' AND source='autopilot'), now()));

  FOR r IN
    SELECT po.id AS post_id, cl.id AS account_id
      FROM public.posts po
      JOIN public.profiles au ON au.id = po.user_id
      CROSS JOIN LATERAL (
        SELECT pr.id FROM public.profiles pr
         WHERE pr.account_source = 'internal'
           AND coalesce(pr.is_banned,false) = false
           AND NOT EXISTS (SELECT 1 FROM public.comments cc
                            WHERE cc.post_id = po.id AND cc.user_id = pr.id)
           AND NOT EXISTS (SELECT 1 FROM public.admin_comment_jobs jj
                            WHERE jj.post_id = po.id AND jj.account_id = pr.id
                              AND jj.status = 'pending')
         ORDER BY random()
         LIMIT greatest(c.per_post_max, 1)
      ) cl
     WHERE coalesce(au.account_source,'') <> 'internal'
       AND (v_since IS NULL OR po.created_at >= v_since)
       AND (v_until IS NULL OR po.created_at < v_until)
     ORDER BY random()
     LIMIT v_need
  LOOP
    v_txt := public._autopilot_pick_content(c);
    CONTINUE WHEN v_txt IS NULL;
    v_t := v_t + make_interval(secs =>
      (greatest(c.min_minutes,1) * 60)
      + floor(random() * greatest((greatest(c.max_minutes, c.min_minutes) - greatest(c.min_minutes,1)) * 60, 1))::int);
    INSERT INTO public.admin_comment_jobs (post_id, account_id, content, run_at, source)
    VALUES (r.post_id, r.account_id, v_txt, v_t, 'autopilot');
    made := made + 1;
  END LOOP;

  UPDATE public.admin_comment_autopilot SET last_plan = now(), updated_at = now() WHERE id = 1;
  RETURN made;
END;
$$;
REVOKE ALL ON FUNCTION public._autopilot_plan(int) FROM PUBLIC;

-- Chạy job tới hạn (không guard admin — dùng cho cron)
DROP FUNCTION IF EXISTS public._autopilot_run_due(int);
CREATE OR REPLACE FUNCTION public._autopilot_run_due(p_max int DEFAULT 30)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record; ok int := 0;
BEGIN
  FOR j IN
    SELECT * FROM public.admin_comment_jobs
     WHERE status = 'pending' AND run_at <= now()
     ORDER BY run_at ASC
     LIMIT greatest(coalesce(p_max,30),1)
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.comments (post_id, user_id, content)
      VALUES (j.post_id, j.account_id, j.content);
      UPDATE public.admin_comment_jobs SET status='done', done_at=now() WHERE id = j.id;
      ok := ok + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.admin_comment_jobs SET status='error', error=SQLERRM, done_at=now() WHERE id = j.id;
    END;
  END LOOP;
  RETURN ok;
END;
$$;
REVOKE ALL ON FUNCTION public._autopilot_run_due(int) FROM PUBLIC;

-- Tick: pg_cron gọi mỗi phút. Tự lập lịch + tự chạy job tới hạn.
DROP FUNCTION IF EXISTS public.admin_autopilot_tick();
CREATE OR REPLACE FUNCTION public.admin_autopilot_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_planned int := 0; v_ran int := 0;
BEGIN
  SELECT status INTO v_status FROM public.admin_comment_autopilot WHERE id = 1;
  IF v_status = 'running' THEN
    v_planned := public._autopilot_plan(40);
    v_ran := public._autopilot_run_due(30);
  END IF;
  UPDATE public.admin_comment_autopilot SET last_tick = now() WHERE id = 1;
  RETURN jsonb_build_object('status', v_status, 'planned', v_planned, 'ran', v_ran);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_tick() TO authenticated, service_role;

-- Đọc cấu hình + thống kê
DROP FUNCTION IF EXISTS public.admin_autopilot_get();
CREATE OR REPLACE FUNCTION public.admin_autopilot_get()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.admin_comment_autopilot%rowtype; v_stats jsonb;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.admin_comment_autopilot WHERE id = 1;
  SELECT jsonb_build_object(
    'pending',  count(*) FILTER (WHERE status='pending'),
    'due',      count(*) FILTER (WHERE status='pending' AND run_at <= now()),
    'done',     count(*) FILTER (WHERE status='done'),
    'error',    count(*) FILTER (WHERE status='error'),
    'cancelled',count(*) FILTER (WHERE status='cancelled'),
    'done_today', count(*) FILTER (WHERE status='done' AND done_at >= date_trunc('day', now()))
  ) INTO v_stats FROM public.admin_comment_jobs;
  RETURN jsonb_build_object('config', to_jsonb(c), 'stats', v_stats);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_get() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_get() TO authenticated;

-- Lưu cấu hình
DROP FUNCTION IF EXISTS public.admin_autopilot_set(jsonb);
CREATE OR REPLACE FUNCTION public.admin_autopilot_set(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.admin_comment_autopilot SET
    modes        = coalesce((SELECT array_agg(value::text) FROM jsonb_array_elements_text(p->'modes')), modes),
    texts        = coalesce((SELECT array_agg(value::text) FROM jsonb_array_elements_text(p->'texts')), texts),
    emojis       = coalesce((SELECT array_agg(value::text) FROM jsonb_array_elements_text(p->'emojis')), emojis),
    range_key    = coalesce(p->>'range_key', range_key),
    custom_from  = CASE WHEN p ? 'custom_from' THEN nullif(p->>'custom_from','')::timestamptz ELSE custom_from END,
    custom_to    = CASE WHEN p ? 'custom_to'   THEN nullif(p->>'custom_to','')::timestamptz   ELSE custom_to END,
    min_minutes  = greatest(coalesce((p->>'min_minutes')::int, min_minutes), 1),
    max_minutes  = greatest(coalesce((p->>'max_minutes')::int, max_minutes), 1),
    per_post_max = greatest(coalesce((p->>'per_post_max')::int, per_post_max), 1),
    queue_target = greatest(coalesce((p->>'queue_target')::int, queue_target), 1),
    updated_at   = now()
  WHERE id = 1;
  RETURN public.admin_autopilot_get();
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_set(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_set(jsonb) TO authenticated;

-- Start / Pause / Resume / Stop
DROP FUNCTION IF EXISTS public.admin_autopilot_control(text);
CREATE OR REPLACE FUNCTION public.admin_autopilot_control(p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_action = 'start' OR p_action = 'resume' THEN
    UPDATE public.admin_comment_autopilot SET status='running', updated_at=now() WHERE id=1;
    PERFORM public._autopilot_plan(40);
  ELSIF p_action = 'pause' THEN
    UPDATE public.admin_comment_autopilot SET status='paused', updated_at=now() WHERE id=1;
  ELSIF p_action = 'stop' THEN
    UPDATE public.admin_comment_autopilot SET status='stopped', updated_at=now() WHERE id=1;
    UPDATE public.admin_comment_jobs SET status='cancelled', done_at=now()
     WHERE status='pending' AND source='autopilot';
  ELSE
    RAISE EXCEPTION 'Hành động không hợp lệ' USING ERRCODE='22023';
  END IF;
  RETURN public.admin_autopilot_get();
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_control(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_control(text) TO authenticated;

-- Job gần đây (kèm thông tin clone/bài) cho bảng thống kê
DROP FUNCTION IF EXISTS public.admin_autopilot_jobs(text,int);
CREATE OR REPLACE FUNCTION public.admin_autopilot_jobs(p_status text DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, post_id uuid, account_id uuid, account_username text,
  content text, run_at timestamptz, status text, error text, source text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT j.id, j.post_id, j.account_id, pr.username, j.content, j.run_at, j.status, j.error, j.source
    FROM public.admin_comment_jobs j
    LEFT JOIN public.profiles pr ON pr.id = j.account_id
   WHERE (p_status IS NULL OR j.status = p_status)
   ORDER BY CASE WHEN j.status='pending' THEN 0 ELSE 1 END, j.run_at DESC
   LIMIT greatest(coalesce(p_limit,100),1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_autopilot_jobs(text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_autopilot_jobs(text,int) TO authenticated;

-- ---------------------------------------------------------------------
-- pg_cron: chạy mỗi phút, độc lập với trình duyệt Admin
-- ---------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron không khả dụng: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'clone_autopilot_tick';
    PERFORM cron.schedule('clone_autopilot_tick', '* * * * *',
                          $cron$SELECT public.admin_autopilot_tick();$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Không lên lịch được cron: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
