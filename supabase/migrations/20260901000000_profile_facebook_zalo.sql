-- Thêm liên hệ Facebook / Zalo vào hồ sơ.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS zalo text;
