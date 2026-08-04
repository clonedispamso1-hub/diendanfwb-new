-- =====================================================================
-- 2026-06-29  Notifications v2 — 3 tabs (Tương tác / Cập nhật / Hoạt động)
--   + Like milestone batching
--   + Delayed red-packet credit (pending claim)
--   + Daily profile-view aggregation
-- Idempotent. Chạy trong Supabase SQL Editor.
-- =====================================================================

-- 0) Cờ pending claim ----------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_pending_claim boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notif_user_kind
  ON public.notifications(user_id, ((data->>'kind')));
CREATE INDEX IF NOT EXISTS idx_notif_pending
  ON public.notifications(user_id) WHERE is_pending_claim = true;

-- 1) Bảng profile_views (1 viewer / 1 profile / 1 ngày) ------------------
CREATE TABLE IF NOT EXISTS public.profile_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_date  date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (viewer_id, profile_id, view_date)
);

GRANT SELECT, INSERT ON public.profile_views TO authenticated;
GRANT ALL ON public.profile_views TO service_role;

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pv_owner_select ON public.profile_views;
CREATE POLICY pv_owner_select ON public.profile_views
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR viewer_id = auth.uid());

DROP POLICY IF EXISTS pv_viewer_insert ON public.profile_views;
CREATE POLICY pv_viewer_insert ON public.profile_views
  FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());

-- 2) Like milestone — trigger trên public.likes --------------------------
CREATE OR REPLACE FUNCTION public.notify_like_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post   public.posts%rowtype;
  v_total  integer;
  v_msec   integer;
  v_mile   integer := NULL;
  v_milestones int[] := ARRAY[10, 50, 100, 500, 1000, 5000, 10000];
BEGIN
  SELECT * INTO v_post FROM public.posts WHERE id = NEW.post_id;
  IF v_post.id IS NULL OR v_post.user_id IS NULL OR v_post.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO v_total FROM public.likes WHERE post_id = NEW.post_id;

  -- Lấy mốc khớp chính xác
  FOREACH v_msec IN ARRAY v_milestones LOOP
    IF v_total = v_msec THEN v_mile := v_msec; EXIT; END IF;
  END LOOP;
  IF v_mile IS NULL THEN RETURN NEW; END IF;

  -- Dedup: 1 mốc / 1 post chỉ tạo notif 1 lần
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_post.user_id
       AND data->>'kind' = 'like_milestone'
       AND data->>'post_id' = v_post.id::text
       AND (data->>'milestone')::int = v_mile
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications(user_id, type, title, message, data)
  VALUES (
    v_post.user_id,
    'like_milestone',
    'Bài viết của bạn đang được yêu thích!',
    format('Bài viết của bạn hiện tại đã đạt được %s tym cố gắng giữ vững phong độ nhé', v_mile),
    jsonb_build_object(
      'kind', 'like_milestone',
      'post_id', v_post.id::text,
      'milestone', v_mile
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_like_milestone ON public.likes;
CREATE TRIGGER trg_like_milestone
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_like_milestone();

-- 3) Red packet delayed claim --------------------------------------------
-- Sửa claim_post_reward_random: thay vì cộng gem_balance ngay, insert notif pending.
CREATE OR REPLACE FUNCTION public.claim_post_reward_random(post_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_post     public.posts%rowtype;
  v_has_like boolean;
  v_has_cmt  boolean;
  v_amount   bigint;
  v_roll     integer;
  v_min_tier bigint;
  v_max_tier bigint;
  v_author   public.profiles%rowtype;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = post_uuid FOR UPDATE;
  IF v_post.id IS NULL THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  IF v_post.user_id = v_me THEN RAISE EXCEPTION 'CANNOT_CLAIM_OWN'; END IF;
  IF NOT COALESCE(v_post.reward_enabled, false) THEN RAISE EXCEPTION 'REWARD_DISABLED'; END IF;
  IF COALESCE(v_post.reward_mode, 'fixed') <> 'random' THEN RAISE EXCEPTION 'WRONG_MODE'; END IF;
  IF v_post.coin_pool_remaining <= 0 THEN RAISE EXCEPTION 'REWARD_EXHAUSTED'; END IF;

  IF EXISTS (SELECT 1 FROM public.post_coin_claims WHERE post_id = post_uuid AND user_id = v_me) THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.likes    WHERE post_id = post_uuid AND user_id = v_me) INTO v_has_like;
  SELECT EXISTS(SELECT 1 FROM public.comments WHERE post_id = post_uuid AND user_id = v_me) INTO v_has_cmt;
  IF NOT v_has_like OR NOT v_has_cmt THEN RAISE EXCEPTION 'NEED_LIKE_AND_COMMENT'; END IF;

  v_roll := floor(random() * 100)::int + 1;
  IF v_roll <= 90 THEN v_min_tier := 1000; v_max_tier := 1999;
  ELSE                  v_min_tier := 2000; v_max_tier := 10000; END IF;
  v_amount := v_min_tier + floor(random() * (v_max_tier - v_min_tier + 1))::bigint;
  IF v_amount > v_post.coin_pool_remaining THEN v_amount := v_post.coin_pool_remaining; END IF;

  INSERT INTO public.post_coin_claims(post_id, user_id, coins_received)
    VALUES (post_uuid, v_me, v_amount);

  UPDATE public.posts
     SET claimed_count       = claimed_count + 1,
         coin_pool_remaining = coin_pool_remaining - v_amount,
         reward_enabled      = CASE WHEN (coin_pool_remaining - v_amount) <= 0 THEN false ELSE reward_enabled END
   WHERE id = post_uuid;

  SELECT * INTO v_author FROM public.profiles WHERE id = v_post.user_id;

  -- DELAYED CREDIT: KHÔNG cộng gem_balance ở đây. Chỉ insert notif pending.
  INSERT INTO public.notifications(user_id, type, title, message, data, is_pending_claim)
  VALUES (
    v_me,
    'red_packet_pending',
    '🧧 Bạn vừa nhận được lì xì!',
    format('Bạn vừa nhận được lì xì trị giá %s từ bài viết của %s',
           v_amount,
           COALESCE(v_author.full_name, v_author.username, 'người dùng')),
    jsonb_build_object(
      'kind', 'red_packet_pending',
      'amount', v_amount,
      'post_id', v_post.id::text,
      'from_id', v_post.user_id::text,
      'from_name', COALESCE(v_author.full_name, v_author.username, 'người dùng')
    ),
    true
  );

  RETURN jsonb_build_object(
    'ok', true,
    'coins', v_amount,
    'pending', true,
    'coin_pool_remaining', v_post.coin_pool_remaining - v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_reward_random(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_reward_random(uuid) TO authenticated;

-- 4) RPC claim_pending_reward — user bấm "Nhận GEM" ----------------------
CREATE OR REPLACE FUNCTION public.claim_pending_reward(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_n        public.notifications%rowtype;
  v_amount   bigint;
  v_new_bal  bigint;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  -- Atomically mark as claimed so user không bấm 2 lần
  UPDATE public.notifications
     SET is_pending_claim = false,
         is_read          = true,
         data             = COALESCE(data,'{}'::jsonb) || jsonb_build_object('claimed_at', now())
   WHERE id = p_notification_id
     AND user_id = v_me
     AND is_pending_claim = true
   RETURNING * INTO v_n;

  IF v_n.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED_OR_NOT_FOUND');
  END IF;

  v_amount := COALESCE(NULLIF(regexp_replace(COALESCE(v_n.data->>'amount',''), '[^0-9]', '', 'g'), '')::bigint, 0);
  IF v_amount > 0 THEN
    PERFORM set_config('app.allow_gem_change',  '1', true);
    PERFORM set_config('app.allow_candy_change','1', true);
    UPDATE public.profiles
       SET gem_balance = COALESCE(gem_balance, 0) + v_amount
     WHERE id = v_me
     RETURNING gem_balance INTO v_new_bal;
  ELSE
    SELECT gem_balance INTO v_new_bal FROM public.profiles WHERE id = v_me;
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'new_balance', v_new_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_reward(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_pending_reward(uuid) TO authenticated;

-- 5) RPC xoá notif theo tab ----------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_interaction_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_n integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  WITH d AS (
    DELETE FROM public.notifications
     WHERE user_id = v_me
       AND COALESCE(data->>'kind','') IN ('comment','reply','follow','like_milestone')
        OR (user_id = v_me AND type IN (
              'comment_post','comment_video','reply','comment','new_comment',
              'post_comment','video_comment','follow','new_follower','like_milestone'))
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  RETURN v_n;
END; $$;

CREATE OR REPLACE FUNCTION public.clear_update_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_n integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  WITH d AS (
    DELETE FROM public.notifications
     WHERE user_id = v_me
       AND is_pending_claim = false
       AND (
            COALESCE(data->>'kind','') IN ('red_packet_pending','red_packet_claimed','gift_post','gift_video','candy_transfer','gem_received')
            OR type IN ('red_packet_pending','gift_post','gift_video','candy_transfer','gem_received','gem_transfer')
           )
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  RETURN v_n;
END; $$;

CREATE OR REPLACE FUNCTION public.clear_activity_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_n integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  WITH d AS (
    DELETE FROM public.notifications
     WHERE user_id = v_me
       AND COALESCE(data->>'kind','') = 'profile_view_agg'
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  -- Xoá luôn lịch sử view hôm nay để hệ thống bắt đầu lại
  DELETE FROM public.profile_views
    WHERE profile_id = v_me AND view_date = (now() AT TIME ZONE 'UTC')::date;
  RETURN v_n;
END; $$;

REVOKE ALL ON FUNCTION public.clear_interaction_notifications() FROM public;
REVOKE ALL ON FUNCTION public.clear_update_notifications() FROM public;
REVOKE ALL ON FUNCTION public.clear_activity_notifications() FROM public;
GRANT EXECUTE ON FUNCTION public.clear_interaction_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_update_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_activity_notifications() TO authenticated;

-- 6) RPC log_profile_view — ghi view + cập nhật notif aggregate trong ngày
CREATE OR REPLACE FUNCTION public.log_profile_view(p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        uuid := auth.uid();
  v_today     date := (now() AT TIME ZONE 'UTC')::date;
  v_viewer    public.profiles%rowtype;
  v_inserted  boolean := false;
  v_n         public.notifications%rowtype;
  v_viewers   jsonb;
  v_count     integer;
BEGIN
  IF v_me IS NULL OR p_target IS NULL OR p_target = v_me THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- Idempotent 1 viewer / 1 profile / 1 ngày
  INSERT INTO public.profile_views(viewer_id, profile_id, view_date)
    VALUES (v_me, p_target, v_today)
    ON CONFLICT (viewer_id, profile_id, view_date) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Nếu hôm nay đã ghi rồi (không phát sinh dòng mới) thì khỏi update notif.
  IF NOT v_inserted THEN
    RETURN jsonb_build_object('ok', true, 'dedup', true);
  END IF;

  SELECT * INTO v_viewer FROM public.profiles WHERE id = v_me;

  -- Tìm notif aggregate của hôm nay
  SELECT * INTO v_n FROM public.notifications
   WHERE user_id = p_target
     AND data->>'kind' = 'profile_view_agg'
     AND (data->>'view_date') = v_today::text
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_n.id IS NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (
      p_target, 'profile_view_agg',
      'Có người vừa xem trang cá nhân của bạn',
      format('%s vừa xem trang cá nhân của bạn',
             COALESCE(v_viewer.full_name, v_viewer.username, 'Ai đó')),
      jsonb_build_object(
        'kind','profile_view_agg',
        'view_date', v_today::text,
        'count', 1,
        'viewers', jsonb_build_array(jsonb_build_object(
          'id', v_me, 'name', COALESCE(v_viewer.full_name, v_viewer.username, 'Ai đó'),
          'avatar', v_viewer.avatar, 'at', now()
        ))
      )
    );
  ELSE
    v_viewers := COALESCE(v_n.data->'viewers','[]'::jsonb);
    -- Nếu đã có viewer này (cùng ngày hiếm khi gặp do dedup, nhưng cứ phòng) thì bỏ
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_viewers) e WHERE e->>'id' = v_me::text
    ) THEN
      v_viewers := jsonb_build_array(jsonb_build_object(
        'id', v_me, 'name', COALESCE(v_viewer.full_name, v_viewer.username, 'Ai đó'),
        'avatar', v_viewer.avatar, 'at', now()
      )) || v_viewers;
    END IF;
    v_count := jsonb_array_length(v_viewers);
    UPDATE public.notifications
       SET data = COALESCE(data,'{}'::jsonb) || jsonb_build_object(
             'viewers', v_viewers, 'count', v_count
           ),
           is_read = false,
           created_at = now()
     WHERE id = v_n.id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.log_profile_view(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.log_profile_view(uuid) TO authenticated;

-- 7) Cleanup cron-friendly view (optional): xoá profile_views cũ > 7 ngày
-- (Khách dùng pg_cron có thể schedule: SELECT cron.schedule(...))
CREATE OR REPLACE FUNCTION public.purge_old_profile_views()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.profile_views
              WHERE view_date < (now() AT TIME ZONE 'UTC')::date - 7
              RETURNING 1)
  SELECT count(*)::int FROM d;
$$;
GRANT EXECUTE ON FUNCTION public.purge_old_profile_views() TO service_role;
