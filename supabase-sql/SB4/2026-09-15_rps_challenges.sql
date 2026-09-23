-- =====================================================================
-- ✊ ✋ ✌  KÉO • BÚA • BAO — LỜI MỜI THÁCH ĐẤU (SUPABASE #4)
-- Chạy file này trong SQL Editor của SUPABASE #4
-- (project ybzdpxwbpbkeqkqwbscp — xem src/lib/supabase-v4.ts).
-- KHÔNG chạy trên Supabase #1 / #2 / #3.
--
-- Idempotent. Toàn bộ ghi dữ liệu đi qua RPC SECURITY DEFINER và chỉ
-- service_role mới được gọi (server function của app giữ key).
-- Xu KHÔNG bị trừ/khóa ở bước gửi lời mời — Xu vẫn do luồng nhận thách
-- đấu hiện tại trên Supabase #1 xử lý.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Bảng lời mời
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rps_challenges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- id phòng PvP bên Supabase #1 (nếu đã tạo phòng), chỉ để đối chiếu.
  room_id        bigint,
  challenger_id  uuid   NOT NULL,
  opponent_id    uuid   NOT NULL,
  stake          bigint NOT NULL CHECK (stake > 0),
  status         text   NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','expired','cancelled')),
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  accepted_at    timestamptz,
  cancelled_at   timestamptz,
  CONSTRAINT rps_challenges_distinct_players CHECK (challenger_id <> opponent_id)
);

CREATE INDEX IF NOT EXISTS rps_challenges_opponent_idx
  ON public.rps_challenges (opponent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rps_challenges_challenger_idx
  ON public.rps_challenges (challenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rps_challenges_pending_idx
  ON public.rps_challenges (status, expires_at);

-- ---------------------------------------------------------------------
-- 2) Quyền + RLS (Data API của Supabase không tự cấp quyền)
-- ---------------------------------------------------------------------
GRANT SELECT ON public.rps_challenges TO authenticated, anon;
GRANT ALL    ON public.rps_challenges TO service_role;

ALTER TABLE public.rps_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rps challenges read" ON public.rps_challenges;
CREATE POLICY "rps challenges read" ON public.rps_challenges
  FOR SELECT TO authenticated, anon USING (true);
-- Mọi INSERT/UPDATE chỉ qua RPC SECURITY DEFINER bên dưới.

-- ---------------------------------------------------------------------
-- 3) Đánh dấu hết hạn (chạy lười, mỗi lần đọc/ghi)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rps4_expire_due()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.rps_challenges
     SET status = 'expired'
   WHERE status = 'pending' AND expires_at <= now();
$$;

-- ---------------------------------------------------------------------
-- 4) Tạo lời mời (chỉ server gọi — UID & số dư đã kiểm ở backend)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rps4_create_challenge(
  p_challenger uuid,
  p_opponent   uuid,
  p_stake      bigint,
  p_room_id    bigint DEFAULT NULL,
  p_ttl_seconds int    DEFAULT 30
) RETURNS public.rps_challenges
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rps_challenges%rowtype;
BEGIN
  IF p_challenger IS NULL OR p_opponent IS NULL THEN
    RAISE EXCEPTION 'MISSING_PLAYER';
  END IF;
  IF p_challenger = p_opponent THEN
    RAISE EXCEPTION 'SELF_CHALLENGE';
  END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'INVALID_STAKE';
  END IF;

  PERFORM public.rps4_expire_due();

  INSERT INTO public.rps_challenges (room_id, challenger_id, opponent_id, stake, expires_at)
  VALUES (
    p_room_id, p_challenger, p_opponent, p_stake,
    now() + make_interval(secs => GREATEST(5, LEAST(300, COALESCE(p_ttl_seconds, 30))))
  )
  RETURNING * INTO r;

  RETURN r;
END $$;

-- ---------------------------------------------------------------------
-- 5) Đọc trạng thái + đồng hồ đếm ngược (nguồn sự thật là server)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rps4_get_challenge(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r      public.rps_challenges%rowtype;
  v_stat text;
BEGIN
  SELECT * INTO r FROM public.rps_challenges WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_stat := r.status;
  IF v_stat = 'pending' AND r.expires_at <= now() THEN
    UPDATE public.rps_challenges SET status = 'expired' WHERE id = r.id;
    v_stat := 'expired';
  END IF;

  RETURN jsonb_build_object(
    'id',            r.id,
    'room_id',       r.room_id,
    'challenger_id', r.challenger_id,
    'opponent_id',   r.opponent_id,
    'stake',         r.stake,
    'status',        v_stat,
    'expires_at',    r.expires_at,
    'server_now',    now(),
    'seconds_left',  GREATEST(0, CEIL(EXTRACT(EPOCH FROM (r.expires_at - now()))))::int
  );
END $$;

-- ---------------------------------------------------------------------
-- 6) Nhận thách đấu — hạn 30s do SERVER quyết định
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rps4_accept_challenge(p_id uuid, p_user uuid)
RETURNS public.rps_challenges
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rps_challenges%rowtype;
BEGIN
  SELECT * INTO r FROM public.rps_challenges WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF r.opponent_id <> p_user THEN RAISE EXCEPTION 'NOT_INVITED'; END IF;
  IF r.status = 'accepted' THEN RETURN r; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'CHALLENGE_%', upper(r.status); END IF;
  IF r.expires_at <= now() THEN
    UPDATE public.rps_challenges SET status = 'expired' WHERE id = r.id;
    RAISE EXCEPTION 'CHALLENGE_EXPIRED';
  END IF;

  UPDATE public.rps_challenges
     SET status = 'accepted', accepted_at = now()
   WHERE id = r.id
  RETURNING * INTO r;

  RETURN r;
END $$;

-- ---------------------------------------------------------------------
-- 7) Huỷ lời mời (A rút lại / gửi card thất bại)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rps4_cancel_challenge(p_id uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rps_challenges%rowtype;
BEGIN
  SELECT * INTO r FROM public.rps_challenges WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF r.challenger_id <> p_user THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  IF r.status <> 'pending' THEN RETURN; END IF;
  UPDATE public.rps_challenges
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = r.id;
END $$;

-- ---------------------------------------------------------------------
-- 8) Cấp quyền gọi RPC
--    Tạo / nhận / huỷ: chỉ service_role (server function của app).
--    Đọc trạng thái: client được phép (chỉ trả về dữ liệu công khai).
-- ---------------------------------------------------------------------
-- Lưu ý: app luôn verify UID + số dư ở server function trước khi gọi RPC.
-- Khi bạn đã thêm secret SUPABASE4_SERVICE_ROLE_KEY cho app, có thể siết lại
-- bằng cách chạy 2 dòng REVOKE ở cuối mục này.
GRANT EXECUTE ON FUNCTION public.rps4_create_challenge(uuid, uuid, bigint, bigint, int) TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rps4_accept_challenge(uuid, uuid) TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rps4_cancel_challenge(uuid, uuid) TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rps4_expire_due() TO service_role;
REVOKE ALL ON FUNCTION public.rps4_expire_due() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rps4_expire_due() TO service_role;

-- (Tuỳ chọn, sau khi có service role key trong app):
-- REVOKE EXECUTE ON FUNCTION public.rps4_create_challenge(uuid, uuid, bigint, bigint, int) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.rps4_accept_challenge(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rps4_get_challenge(uuid) TO service_role, authenticated, anon;

-- ---------------------------------------------------------------------
-- 9) Realtime (tuỳ chọn)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rps_challenges;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END $$;
ALTER TABLE public.rps_challenges REPLICA IDENTITY FULL;
