-- =====================================================================
-- ⭐ Engagement Booster — schema + RPCs
-- Chạy 1 lần trong Supabase SQL Editor. An toàn để chạy lại (idempotent).
--
-- Cấu trúc:
--   engagement_campaigns  — mỗi campaign do admin tạo.
--   engagement_events     — log từng lượt tăng like/… (resumable).
--   engagement_tick()     — SECURITY DEFINER, admin-only.
--                            gọi định kỳ từ UI (5-10s) để phân phối tự nhiên.
--   engagement_create_campaign / pause / resume / cancel — quản lý.
--
-- Hiện tại chỉ implement kind='like'. Schema sẵn sàng cho
-- comment / view / share / follow trong tương lai.
-- =====================================================================

-- ===== 1. TABLES =====

CREATE TABLE IF NOT EXISTS public.engagement_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('like','comment','view','share','follow')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','paused','completed','cancelled')),
  target_user_id uuid,                     -- nullable; ghi lại nếu campaign chạy trên toàn bộ post của 1 user
  target_post_ids uuid[] NOT NULL,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { "<post_uuid>": integer_target }
  completed jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "<post_uuid>": integer_added }
  total_amount integer NOT NULL,
  completed_amount integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  last_tick_at timestamptz,
  finished_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engagement_campaigns_status_idx
  ON public.engagement_campaigns (status, ends_at);
CREATE INDEX IF NOT EXISTS engagement_campaigns_created_idx
  ON public.engagement_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS public.engagement_events (
  id bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.engagement_campaigns(id) ON DELETE CASCADE,
  post_id uuid NOT NULL,
  kind text NOT NULL,
  delta integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engagement_events_campaign_idx
  ON public.engagement_events (campaign_id, created_at DESC);

-- ===== 2. GRANTS =====
GRANT SELECT ON public.engagement_campaigns TO authenticated;
GRANT SELECT ON public.engagement_events TO authenticated;
GRANT ALL ON public.engagement_campaigns TO service_role;
GRANT ALL ON public.engagement_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engagement_events_id_seq TO service_role;

ALTER TABLE public.engagement_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

-- Admin auth dùng đúng hệ bangchu hiện có của Admin Panel.
-- Không phụ thuộc public.has_role() và không tạo role system mới.
CREATE OR REPLACE FUNCTION public._engagement_is_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bangchu b
    WHERE b.auth_user_id = _user
      AND b.status = 'approved'
      AND b.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public._engagement_is_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "admin read campaigns" ON public.engagement_campaigns;
CREATE POLICY "admin read campaigns" ON public.engagement_campaigns
  FOR SELECT TO authenticated
  USING (public._engagement_is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin read events" ON public.engagement_events;
CREATE POLICY "admin read events" ON public.engagement_events
  FOR SELECT TO authenticated
  USING (public._engagement_is_admin(auth.uid()));

-- ===== 3. RPCs =====

CREATE OR REPLACE FUNCTION public._engagement_require_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._engagement_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public._engagement_require_admin() TO authenticated;

-- Tạo campaign. totals[post_id] = số like cần thêm cho post đó (đã tính từ client).
CREATE OR REPLACE FUNCTION public.engagement_create_campaign(
  _kind text,
  _post_ids uuid[],
  _totals jsonb,
  _total_amount integer,
  _duration_seconds integer,
  _target_user_id uuid,
  _note text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM public._engagement_require_admin();
  IF _kind <> 'like' THEN
    RAISE EXCEPTION 'only like campaigns are supported for now';
  END IF;
  IF array_length(_post_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no target posts';
  END IF;
  IF _total_amount <= 0 OR _duration_seconds <= 0 THEN
    RAISE EXCEPTION 'invalid amount/duration';
  END IF;

  INSERT INTO public.engagement_campaigns
    (admin_id, kind, target_user_id, target_post_ids, totals,
     total_amount, duration_seconds, ends_at, note)
  VALUES
    (auth.uid(), _kind, _target_user_id, _post_ids, _totals,
     _total_amount, _duration_seconds,
     now() + make_interval(secs => _duration_seconds), _note)
  RETURNING id INTO _id;

  RETURN _id;
END $$;

-- Tick: quét mọi campaign đang chạy, phân bổ delta tự nhiên theo thời gian.
-- Trả về jsonb summary { ticked: n, likes_added: total }.
CREATE OR REPLACE FUNCTION public.engagement_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  post_id_txt text;
  post_uuid uuid;
  target_i integer;
  done_i integer;
  elapsed_frac numeric;
  jitter numeric;
  expected numeric;
  delta integer;
  new_completed jsonb;
  new_total_added integer;
  campaign_delta integer;
  ticked integer := 0;
  total_added integer := 0;
BEGIN
  PERFORM public._engagement_require_admin();

  FOR c IN
    SELECT * FROM public.engagement_campaigns
    WHERE status = 'running'
    ORDER BY started_at
    FOR UPDATE SKIP LOCKED
  LOOP
    new_completed := c.completed;
    campaign_delta := 0;

    elapsed_frac := EXTRACT(EPOCH FROM (now() - c.started_at)) / c.duration_seconds;
    IF elapsed_frac < 0 THEN elapsed_frac := 0; END IF;
    IF elapsed_frac > 1 THEN elapsed_frac := 1; END IF;

    FOR post_id_txt IN SELECT jsonb_object_keys(c.totals)
    LOOP
      target_i := COALESCE((c.totals ->> post_id_txt)::int, 0);
      done_i   := COALESCE((new_completed ->> post_id_txt)::int, 0);
      IF target_i <= done_i THEN CONTINUE; END IF;

      IF elapsed_frac >= 1 THEN
        delta := target_i - done_i;
      ELSE
        jitter := 0.85 + (random() * 0.20);   -- 0.85 .. 1.05
        expected := floor(target_i * elapsed_frac * jitter);
        delta := GREATEST(0, LEAST((expected)::int - done_i, target_i - done_i));
        -- luôn cho tiến ít nhất 1 nếu đã qua > 0 và chưa đủ ở tick cuối
        IF delta = 0 AND elapsed_frac > 0.05 AND (target_i - done_i) > 0
           AND random() < 0.35 THEN
          delta := 1;
        END IF;
      END IF;

      IF delta > 0 THEN
        BEGIN
          post_uuid := post_id_txt::uuid;
        EXCEPTION WHEN others THEN
          CONTINUE;
        END;

        UPDATE public.posts
          SET likes_count = COALESCE(likes_count, 0) + delta
          WHERE id = post_uuid;

        INSERT INTO public.engagement_events(campaign_id, post_id, kind, delta)
          VALUES (c.id, post_uuid, c.kind, delta);

        new_completed := jsonb_set(
          new_completed,
          ARRAY[post_id_txt],
          to_jsonb(done_i + delta),
          true
        );
        campaign_delta := campaign_delta + delta;
      END IF;
    END LOOP;

    new_total_added := c.completed_amount + campaign_delta;

    UPDATE public.engagement_campaigns
      SET completed = new_completed,
          completed_amount = new_total_added,
          last_tick_at = now(),
          status = CASE
            WHEN new_total_added >= c.total_amount OR now() >= c.ends_at
              THEN 'completed'
            ELSE 'running'
          END,
          finished_at = CASE
            WHEN new_total_added >= c.total_amount OR now() >= c.ends_at
              THEN now()
            ELSE NULL
          END
      WHERE id = c.id;

    ticked := ticked + 1;
    total_added := total_added + campaign_delta;
  END LOOP;

  RETURN jsonb_build_object('ticked', ticked, 'added', total_added);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_set_status(_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._engagement_require_admin();
  IF _status NOT IN ('running','paused','cancelled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.engagement_campaigns
    SET status = _status,
        finished_at = CASE WHEN _status = 'cancelled' THEN now() ELSE finished_at END
    WHERE id = _id AND status <> 'completed';
END $$;

GRANT EXECUTE ON FUNCTION public.engagement_create_campaign(text, uuid[], jsonb, integer, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_tick() TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_set_status(uuid, text) TO authenticated;

-- Done.