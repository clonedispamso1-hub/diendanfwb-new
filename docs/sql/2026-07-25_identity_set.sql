-- 2026-07-25 — Identity Set (Crown + Pet + Flag)
-- Mỗi tài khoản được random cố định một bộ nhận diện khi tạo lần đầu.
-- Chạy trên DB cũ (Supabase project zbuwddjcqdlyijcunwgd) qua SQL Editor.
-- An toàn khi chạy lại (idempotent).

-- 1. Thêm 3 cột lưu bộ nhận diện. NULL = chưa random.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_crown text,
  ADD COLUMN IF NOT EXISTS identity_pet   text,
  ADD COLUMN IF NOT EXISTS identity_flag  text;

COMMENT ON COLUMN public.profiles.identity_crown IS
  'Crown variant cố định — gold|silver|purple|blue|red|pink. Chỉ random 1 lần khi tạo.';
COMMENT ON COLUMN public.profiles.identity_pet IS
  'Pet variant cố định — chick|cat|dog|rabbit|duck|fish|bird|fox|bear.';
COMMENT ON COLUMN public.profiles.identity_flag IS
  'Flag variant cố định — vn|vn_heart|vn_gold|vn_glow.';

-- 2. Backfill cho các user cũ (chỉ update khi NULL — không đổi user đã có).
UPDATE public.profiles
SET identity_crown = (ARRAY['gold','silver','purple','blue','red','pink'])
                     [1 + floor(random()*6)::int]
WHERE identity_crown IS NULL;

UPDATE public.profiles
SET identity_pet = (ARRAY['chick','cat','dog','rabbit','duck','fish','bird','fox','bear'])
                   [1 + floor(random()*9)::int]
WHERE identity_pet IS NULL;

UPDATE public.profiles
SET identity_flag = (ARRAY['vn','vn_heart','vn_gold','vn_glow'])
                    [1 + floor(random()*4)::int]
WHERE identity_flag IS NULL;

-- 3. Trigger BEFORE INSERT: tự động gán khi tạo profile mới.
CREATE OR REPLACE FUNCTION public.set_profile_identity_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.identity_crown IS NULL THEN
    NEW.identity_crown := (ARRAY['gold','silver','purple','blue','red','pink'])
                          [1 + floor(random()*6)::int];
  END IF;
  IF NEW.identity_pet IS NULL THEN
    NEW.identity_pet := (ARRAY['chick','cat','dog','rabbit','duck','fish','bird','fox','bear'])
                        [1 + floor(random()*9)::int];
  END IF;
  IF NEW.identity_flag IS NULL THEN
    NEW.identity_flag := (ARRAY['vn','vn_heart','vn_gold','vn_glow'])
                         [1 + floor(random()*4)::int];
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_profile_identity_set ON public.profiles;
CREATE TRIGGER trg_set_profile_identity_set
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_identity_set();

-- 4. Ràng buộc giá trị hợp lệ (tùy chọn — bỏ qua nếu bạn muốn admin tự do).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_identity_values_chk') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_identity_values_chk
      CHECK (
        (identity_crown IS NULL OR identity_crown IN ('gold','silver','purple','blue','red','pink')) AND
        (identity_pet   IS NULL OR identity_pet   IN ('chick','cat','dog','rabbit','duck','fish','bird','fox','bear')) AND
        (identity_flag  IS NULL OR identity_flag  IN ('vn','vn_heart','vn_gold','vn_glow'))
      );
  END IF;
END $$;
