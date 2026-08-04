-- ============================================================
-- FWB Match System (RUN MIGRATION REQUIRED)
-- - fake_profiles.profile_type ('demo' default)
-- - fwb_likes: A bấm ❤️ Kết nối B (B có thể là user thật hoặc demo)
-- - fwb_matches: tự động tạo khi cả 2 chiều đều có like (real ↔ real)
-- ============================================================

ALTER TABLE public.fake_profiles
  ADD COLUMN IF NOT EXISTS profile_type TEXT NOT NULL DEFAULT 'demo';
COMMENT ON COLUMN public.fake_profiles.profile_type IS
  'demo = hồ sơ hệ thống dùng để lấp đầy danh sách FWB (không giả mạo người thật)';
CREATE INDEX IF NOT EXISTS fake_profiles_profile_type_idx
  ON public.fake_profiles (profile_type);

CREATE TABLE IF NOT EXISTS public.fwb_likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user     uuid,
  to_demo_id  uuid,
  to_kind     TEXT NOT NULL CHECK (to_kind IN ('real','demo')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fwb_likes_target_check CHECK (
    (to_kind = 'real' AND to_user IS NOT NULL AND to_demo_id IS NULL) OR
    (to_kind = 'demo' AND to_demo_id IS NOT NULL AND to_user IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS fwb_likes_real_uq
  ON public.fwb_likes (from_user, to_user) WHERE to_kind = 'real';
CREATE UNIQUE INDEX IF NOT EXISTS fwb_likes_demo_uq
  ON public.fwb_likes (from_user, to_demo_id) WHERE to_kind = 'demo';
CREATE INDEX IF NOT EXISTS fwb_likes_to_user_idx ON public.fwb_likes (to_user);

GRANT SELECT, INSERT, DELETE ON public.fwb_likes TO authenticated;
GRANT ALL ON public.fwb_likes TO service_role;
ALTER TABLE public.fwb_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fwb_likes_select ON public.fwb_likes;
CREATE POLICY fwb_likes_select ON public.fwb_likes
  FOR SELECT TO authenticated
  USING (from_user = auth.uid() OR to_user = auth.uid());

DROP POLICY IF EXISTS fwb_likes_insert ON public.fwb_likes;
CREATE POLICY fwb_likes_insert ON public.fwb_likes
  FOR INSERT TO authenticated
  WITH CHECK (from_user = auth.uid());

DROP POLICY IF EXISTS fwb_likes_delete ON public.fwb_likes;
CREATE POLICY fwb_likes_delete ON public.fwb_likes
  FOR DELETE TO authenticated
  USING (from_user = auth.uid());

CREATE TABLE IF NOT EXISTS public.fwb_matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matched_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_low, user_high),
  CHECK (user_low < user_high)
);
CREATE INDEX IF NOT EXISTS fwb_matches_low_idx  ON public.fwb_matches (user_low);
CREATE INDEX IF NOT EXISTS fwb_matches_high_idx ON public.fwb_matches (user_high);

GRANT SELECT ON public.fwb_matches TO authenticated;
GRANT ALL ON public.fwb_matches TO service_role;
ALTER TABLE public.fwb_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fwb_matches_select ON public.fwb_matches;
CREATE POLICY fwb_matches_select ON public.fwb_matches
  FOR SELECT TO authenticated
  USING (user_low = auth.uid() OR user_high = auth.uid());

CREATE OR REPLACE FUNCTION public.fwb_likes_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_low uuid; v_high uuid;
BEGIN
  IF NEW.to_kind <> 'real' THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fwb_likes
    WHERE from_user = NEW.to_user AND to_user = NEW.from_user AND to_kind = 'real'
  ) THEN
    IF NEW.from_user < NEW.to_user THEN
      v_low := NEW.from_user; v_high := NEW.to_user;
    ELSE
      v_low := NEW.to_user;   v_high := NEW.from_user;
    END IF;
    INSERT INTO public.fwb_matches (user_low, user_high)
    VALUES (v_low, v_high) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fwb_likes_trg ON public.fwb_likes;
CREATE TRIGGER fwb_likes_trg
  AFTER INSERT ON public.fwb_likes
  FOR EACH ROW EXECUTE FUNCTION public.fwb_likes_after_insert();

CREATE OR REPLACE FUNCTION public.fwb_is_matched(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fwb_matches
    WHERE user_low = LEAST(_a, _b) AND user_high = GREATEST(_a, _b)
  );
$$;

GRANT EXECUTE ON FUNCTION public.fwb_is_matched(uuid, uuid) TO authenticated;
