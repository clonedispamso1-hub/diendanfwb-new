-- =====================================================================
-- 2026-08-06  CLONE SUITE — chạy 1 lần trong Supabase SQL Editor.
-- Idempotent. KHÔNG tạo project mới, KHÔNG đổi URL/Key.
--
-- Bổ sung cho docs/sql/2026-08-02_SECOND_ACCOUNTS_FINAL.sql:
--   1) Tab "User" trong Tin nhắn  → admin_internal_real_users / broadcast
--   2) Clone nhận Bao lì xì       → admin_internal_get_red_packet / open
--   3) Bài viết user thật         → admin_internal_real_posts / post_comments
--   4) Comment GIF hàng loạt      → admin_internal_comment_many
--   5) Auto Comment Scheduler     → bảng admin_comment_jobs + RPC
--   6) Notification của Clone     → admin_internal_notif_* 
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Dọn overload cũ (nếu chạy lại nhiều lần)
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND p.proname IN (
         'admin_internal_real_users','admin_internal_broadcast_message',
         'admin_internal_get_red_packet','admin_internal_open_red_packet',
         'admin_internal_real_posts','admin_internal_post_comments',
         'admin_internal_comment_many','admin_internal_schedule_comments',
         'admin_internal_list_comment_jobs','admin_internal_cancel_comment_jobs',
         'admin_internal_run_due_comment_jobs','admin_internal_notif_counts',
         'admin_internal_notifications','admin_internal_notif_mark_read'
       )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- =====================================================================
-- 1) USER THẬT (loại clone + admin)
-- =====================================================================
DROP FUNCTION IF EXISTS public.admin_internal_real_users(text,timestamptz,int);
CREATE OR REPLACE FUNCTION public.admin_internal_real_users(
  p_search text DEFAULT NULL,
  p_since  timestamptz DEFAULT NULL,
  p_limit  int DEFAULT 1000
) RETURNS TABLE (
  id uuid, username text, full_name text, avatar text,
  is_online boolean, last_seen timestamptz, created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text := nullif(btrim(coalesce(p_search,'')),'');
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT pr.id, pr.username, pr.full_name, pr.avatar,
         coalesce(pr.is_online,false),
         pr.last_seen, pr.created_at
    FROM public.profiles pr
   WHERE coalesce(pr.account_source,'') <> 'internal'
     AND coalesce(pr.is_admin,false) = false
     AND (v_q IS NULL
          OR pr.username ILIKE '%'||v_q||'%'
          OR coalesce(pr.full_name,'') ILIKE '%'||v_q||'%')
     AND (p_since IS NULL
          OR coalesce(pr.last_seen, pr.created_at) >= p_since
          OR pr.created_at >= p_since)
   ORDER BY coalesce(pr.is_online,false) DESC,
            coalesce(pr.last_seen, pr.created_at) DESC NULLS LAST
   LIMIT greatest(coalesce(p_limit,1000),1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_real_users(text,timestamptz,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_real_users(text,timestamptz,int) TO authenticated;

-- Gửi tin nhắn hàng loạt: N clone x M user (tích Descartes)
DROP FUNCTION IF EXISTS public.admin_internal_broadcast_message(uuid[],uuid[],text,text);
CREATE OR REPLACE FUNCTION public.admin_internal_broadcast_message(
  p_accounts uuid[], p_peers uuid[], p_content text, p_image_url text DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a uuid; u uuid; ok int := 0;
  v_img text := nullif(btrim(coalesce(p_image_url,'')),'');
  v_txt text := btrim(coalesce(p_content,''));
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(p_accounts,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn tài khoản clone' USING ERRCODE='22023';
  END IF;
  IF coalesce(array_length(p_peers,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn người nhận' USING ERRCODE='22023';
  END IF;
  IF v_txt = '' AND v_img IS NULL THEN
    RAISE EXCEPTION 'Nội dung trống' USING ERRCODE='22023';
  END IF;

  FOREACH a IN ARRAY p_accounts LOOP
    IF EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=a AND pr.account_source='internal') THEN
      FOREACH u IN ARRAY p_peers LOOP
        IF u <> a THEN
          INSERT INTO public.messages (sender_id, receiver_id, content, image_url, is_read)
          VALUES (a, u, v_txt, v_img, false);
          ok := ok + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN ok;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_broadcast_message(uuid[],uuid[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_broadcast_message(uuid[],uuid[],text,text) TO authenticated;

-- =====================================================================
-- 2) CLONE NHẬN BAO LÌ XÌ
-- =====================================================================
DROP FUNCTION IF EXISTS public.admin_internal_get_red_packet(uuid,uuid);
CREATE OR REPLACE FUNCTION public.admin_internal_get_red_packet(
  p_account uuid, p_packet uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.chat_red_packets%rowtype;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.chat_red_packets WHERE id = p_packet;
  IF v.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'id', v.id, 'sender_id', v.sender_id, 'receiver_id', v.receiver_id,
    'amount', v.amount, 'wish', v.wish, 'status', v.status,
    'opened_at', v.opened_at, 'created_at', v.created_at,
    'can_open', (v.receiver_id = p_account AND v.status = 'waiting')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_get_red_packet(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_get_red_packet(uuid,uuid) TO authenticated;

-- Mở bao lì xì với tư cách clone — logic y hệt open_chat_red_packet.
DROP FUNCTION IF EXISTS public.admin_internal_open_red_packet(uuid,uuid);
CREATE OR REPLACE FUNCTION public.admin_internal_open_red_packet(
  p_account uuid, p_packet uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.chat_red_packets%rowtype; v_new bigint;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO v FROM public.chat_red_packets WHERE id = p_packet FOR UPDATE;
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','NOT_FOUND', 'message','Bao lì xì không tồn tại');
  END IF;
  IF v.receiver_id <> p_account THEN
    RETURN jsonb_build_object('ok', false, 'code','FORBIDDEN', 'message','Tài khoản này không phải người nhận');
  END IF;
  IF v.status = 'opened' THEN
    RETURN jsonb_build_object('ok', true, 'already_opened', true,
      'amount', v.amount, 'wish', v.wish, 'opened_at', v.opened_at);
  END IF;
  IF v.status <> 'waiting' THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID_STATUS', 'message','Bao lì xì không khả dụng');
  END IF;

  UPDATE public.chat_red_packets
     SET status='opened', opened_at=now()
   WHERE id = p_packet AND status='waiting';
  IF NOT FOUND THEN
    SELECT * INTO v FROM public.chat_red_packets WHERE id = p_packet;
    RETURN jsonb_build_object('ok', true, 'already_opened', true,
      'amount', v.amount, 'wish', v.wish, 'opened_at', v.opened_at);
  END IF;

  PERFORM set_config('app.allow_gem_change','1', true);
  PERFORM set_config('app.allow_candy_change','1', true);

  UPDATE public.profiles
     SET gem_balance = coalesce(gem_balance,0) + v.amount
   WHERE id = p_account
   RETURNING gem_balance INTO v_new;

  BEGIN
    INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
    VALUES (v.sender_id, 'red_packet_opened', '🎉 Bao lì xì đã được mở',
      'Người nhận đã mở bao lì xì ' || v.amount::text || ' Xu của bạn.',
      jsonb_build_object('packet_id', v.id, 'amount', v.amount, 'receiver_id', p_account),
      false, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'already_opened', false,
    'amount', v.amount, 'wish', v.wish, 'new_balance', v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_open_red_packet(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_open_red_packet(uuid,uuid) TO authenticated;

-- =====================================================================
-- 3) BÀI VIẾT CỦA USER THẬT
-- =====================================================================
DROP FUNCTION IF EXISTS public.admin_internal_real_posts(text,timestamptz,int);
CREATE OR REPLACE FUNCTION public.admin_internal_real_posts(
  p_search text DEFAULT NULL,
  p_since  timestamptz DEFAULT NULL,
  p_limit  int DEFAULT 200
) RETURNS TABLE (
  id uuid, content text, created_at timestamptz,
  author_id uuid, author_username text, author_name text, author_avatar text,
  comments_count bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text := nullif(btrim(coalesce(p_search,'')),'');
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT po.id, po.content, po.created_at,
         pr.id, pr.username, pr.full_name, pr.avatar,
         (SELECT count(*) FROM public.comments c WHERE c.post_id = po.id)::bigint
    FROM public.posts po
    JOIN public.profiles pr ON pr.id = po.user_id
   WHERE coalesce(pr.account_source,'') <> 'internal'
     AND coalesce(pr.is_admin,false) = false
     AND (p_since IS NULL OR po.created_at >= p_since)
     AND (v_q IS NULL
          OR coalesce(po.content,'') ILIKE '%'||v_q||'%'
          OR pr.username ILIKE '%'||v_q||'%'
          OR coalesce(pr.full_name,'') ILIKE '%'||v_q||'%')
   ORDER BY po.created_at DESC
   LIMIT greatest(coalesce(p_limit,200),1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_real_posts(text,timestamptz,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_real_posts(text,timestamptz,int) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_internal_post_comments(uuid,int);
CREATE OR REPLACE FUNCTION public.admin_internal_post_comments(
  p_post uuid, p_limit int DEFAULT 100
) RETURNS TABLE (
  id uuid, content text, created_at timestamptz,
  author_id uuid, author_username text, author_name text, author_avatar text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT c.id, c.content, c.created_at, pr.id, pr.username, pr.full_name, pr.avatar
    FROM public.comments c
    LEFT JOIN public.profiles pr ON pr.id = c.user_id
   WHERE c.post_id = p_post
   ORDER BY c.created_at ASC
   LIMIT greatest(coalesce(p_limit,100),1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_post_comments(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_post_comments(uuid,int) TO authenticated;

-- =====================================================================
-- 4) COMMENT HÀNG LOẠT (nhiều bài x nhiều clone, nội dung/GIF chung)
-- =====================================================================
DROP FUNCTION IF EXISTS public.admin_internal_comment_many(uuid[],uuid[],text[]);
CREATE OR REPLACE FUNCTION public.admin_internal_comment_many(
  p_posts uuid[], p_accounts uuid[], p_contents text[]
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  po uuid; a uuid; ok int := 0; k int := 0;
  n int := coalesce(array_length(p_contents,1),0);
  v_txt text;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(p_posts,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn bài viết' USING ERRCODE='22023';
  END IF;
  IF coalesce(array_length(p_accounts,1),0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn tài khoản clone' USING ERRCODE='22023';
  END IF;
  IF n = 0 THEN RAISE EXCEPTION 'Chưa có nội dung bình luận' USING ERRCODE='22023'; END IF;

  FOREACH po IN ARRAY p_posts LOOP
    IF EXISTS (SELECT 1 FROM public.posts x WHERE x.id = po) THEN
      FOREACH a IN ARRAY p_accounts LOOP
        k := k + 1;
        v_txt := btrim(coalesce(p_contents[((k-1) % n) + 1],''));
        IF v_txt <> '' THEN
          INSERT INTO public.comments (post_id, user_id, content) VALUES (po, a, v_txt);
          ok := ok + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN ok;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_comment_many(uuid[],uuid[],text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_comment_many(uuid[],uuid[],text[]) TO authenticated;

-- =====================================================================
-- 5) AUTO COMMENT SCHEDULER
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_comment_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     text NOT NULL,
  run_at      timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled','error')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);
CREATE INDEX IF NOT EXISTS admin_comment_jobs_due_idx ON public.admin_comment_jobs(status, run_at);

GRANT ALL ON public.admin_comment_jobs TO service_role;
ALTER TABLE public.admin_comment_jobs ENABLE ROW LEVEL SECURITY;
-- Không cấp quyền trực tiếp cho authenticated: mọi truy cập đi qua RPC dưới đây.

DROP FUNCTION IF EXISTS public.admin_internal_schedule_comments(uuid[],uuid[],text[],int,int,timestamptz);
CREATE OR REPLACE FUNCTION public.admin_internal_schedule_comments(
  p_posts uuid[], p_accounts uuid[], p_contents text[],
  p_min_seconds int DEFAULT 60, p_max_seconds int DEFAULT 900,
  p_start timestamptz DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pairs record;
  v_t timestamptz := coalesce(p_start, now());
  v_min int := greatest(coalesce(p_min_seconds,60), 5);
  v_max int := greatest(coalesce(p_max_seconds,900), greatest(coalesce(p_min_seconds,60), 5));
  n int := coalesce(array_length(p_contents,1),0);
  ok int := 0; k int := 0; v_txt text;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(p_posts,1),0) = 0 OR coalesce(array_length(p_accounts,1),0) = 0 THEN
    RAISE EXCEPTION 'Cần chọn cả bài viết và tài khoản' USING ERRCODE='22023';
  END IF;
  IF n = 0 THEN RAISE EXCEPTION 'Chưa có nội dung bình luận' USING ERRCODE='22023'; END IF;

  -- Ghép ngẫu nhiên clone <-> bài để trông tự nhiên
  FOR v_pairs IN
    SELECT p AS post_id, a AS account_id
      FROM unnest(p_posts) AS p
      CROSS JOIN unnest(p_accounts) AS a
     ORDER BY random()
  LOOP
    k := k + 1;
    v_txt := btrim(coalesce(p_contents[((k-1) % n) + 1],''));
    CONTINUE WHEN v_txt = '';
    v_t := v_t + make_interval(secs => (v_min + floor(random() * (v_max - v_min + 1)))::int);
    INSERT INTO public.admin_comment_jobs(post_id, account_id, content, run_at)
    VALUES (v_pairs.post_id, v_pairs.account_id, v_txt, v_t);
    ok := ok + 1;
  END LOOP;
  RETURN ok;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_schedule_comments(uuid[],uuid[],text[],int,int,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_schedule_comments(uuid[],uuid[],text[],int,int,timestamptz) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_internal_list_comment_jobs(text,int);
CREATE OR REPLACE FUNCTION public.admin_internal_list_comment_jobs(
  p_status text DEFAULT NULL, p_limit int DEFAULT 200
) RETURNS TABLE (
  id uuid, post_id uuid, account_id uuid, account_username text, account_avatar text,
  content text, run_at timestamptz, status text, error text, done_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT j.id, j.post_id, j.account_id, pr.username, pr.avatar,
         j.content, j.run_at, j.status, j.error, j.done_at
    FROM public.admin_comment_jobs j
    LEFT JOIN public.profiles pr ON pr.id = j.account_id
   WHERE (p_status IS NULL OR j.status = p_status)
   ORDER BY j.run_at ASC
   LIMIT greatest(coalesce(p_limit,200),1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_list_comment_jobs(text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_list_comment_jobs(text,int) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_internal_cancel_comment_jobs(uuid[]);
CREATE OR REPLACE FUNCTION public.admin_internal_cancel_comment_jobs(
  p_ids uuid[] DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.admin_comment_jobs
     SET status = 'cancelled'
   WHERE status = 'pending' AND (p_ids IS NULL OR id = ANY(p_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_cancel_comment_jobs(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_cancel_comment_jobs(uuid[]) TO authenticated;

-- Chạy các job tới hạn. Gọi định kỳ từ Admin (khi mở tab) hoặc pg_cron.
DROP FUNCTION IF EXISTS public.admin_internal_run_due_comment_jobs(int);
CREATE OR REPLACE FUNCTION public.admin_internal_run_due_comment_jobs(
  p_max int DEFAULT 20
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record; ok int := 0;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  FOR j IN
    SELECT * FROM public.admin_comment_jobs
     WHERE status = 'pending' AND run_at <= now()
     ORDER BY run_at ASC
     LIMIT greatest(coalesce(p_max,20),1)
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
REVOKE ALL ON FUNCTION public.admin_internal_run_due_comment_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_run_due_comment_jobs(int) TO authenticated;

-- =====================================================================
-- 6) NOTIFICATION CỦA CLONE
-- =====================================================================
DROP FUNCTION IF EXISTS public.admin_internal_notif_counts();
CREATE OR REPLACE FUNCTION public.admin_internal_notif_counts()
RETURNS TABLE (account_id uuid, unread bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT pr.id,
         (SELECT count(*) FROM public.notifications n
           WHERE n.user_id = pr.id AND coalesce(n.is_read,false) = false)::bigint
    FROM public.profiles pr
   WHERE pr.account_source = 'internal';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_notif_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_notif_counts() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_internal_notifications(uuid,int);
CREATE OR REPLACE FUNCTION public.admin_internal_notifications(
  p_account uuid, p_limit int DEFAULT 100
) RETURNS TABLE (
  id uuid, type text, title text, message text, data jsonb,
  is_read boolean, created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT n.id, n.type::text, n.title, n.message, coalesce(n.data,'{}'::jsonb),
         coalesce(n.is_read,false), n.created_at
    FROM public.notifications n
   WHERE n.user_id = p_account
   ORDER BY n.created_at DESC
   LIMIT greatest(coalesce(p_limit,100),1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_notifications(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_notifications(uuid,int) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_internal_notif_mark_read(uuid,uuid);
CREATE OR REPLACE FUNCTION public.admin_internal_notif_mark_read(
  p_account uuid, p_id uuid DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.notifications
     SET is_read = true
   WHERE user_id = p_account AND coalesce(is_read,false) = false
     AND (p_id IS NULL OR id = p_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_notif_mark_read(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_notif_mark_read(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
