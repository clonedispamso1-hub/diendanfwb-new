-- Chạy nguyên khối này trong SQL Editor của database hiện tại.
-- An toàn khi chạy lại: IF NOT EXISTS không làm mất dữ liệu cũ.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reputation_score INT NOT NULL DEFAULT 100;

COMMENT ON COLUMN public.profiles.reputation_score IS
  'Điểm uy tín hiển thị trên trang cá nhân thành viên; mặc định 100.';