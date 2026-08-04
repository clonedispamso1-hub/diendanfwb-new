-- Task #4.4 — Avatar Frame column
-- Add optional avatar_frame URL column to profiles. NULL = no frame.
-- Frame là URL PNG đã xóa nền, hiển thị đè lên avatar.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_frame text;

COMMENT ON COLUMN public.profiles.avatar_frame IS
  'Optional PNG frame URL rendered above the avatar. NULL = no frame.';

-- Không cần policy mới: avatar_frame là public read (đi kèm profile hiện tại).