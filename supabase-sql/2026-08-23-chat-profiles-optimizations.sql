-- =====================================================================
-- 2026-08-23 — Tối ưu Chat / Thông báo / Hồ sơ
-- Chạy TAY trên đúng project Supabase (DB cũ, không tạo DB mới):
--   Phần A → Supabase #3 (chat/logs: uaqsetfdciyzxpuhulux)
--   Phần B → Supabase #1 (core/profiles: gxfxqbhxoghdhokwjpex)
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. XOÁ TIN NHẮN PHÍA TÔI (delete for me) — Supabase #3
-- ---------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_by_users uuid[] NOT NULL DEFAULT '{}';

-- Truy vấn lọc `deleted_by_users` nhanh hơn.
CREATE INDEX IF NOT EXISTS messages_deleted_by_users_idx
  ON public.messages USING gin (deleted_by_users);

-- Chỉ 2 người trong hội thoại mới được cập nhật cột này.
DROP POLICY IF EXISTS "messages_delete_for_me" ON public.messages;
CREATE POLICY "messages_delete_for_me"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;

-- Realtime cho notifications (nếu chưa bật).
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ---------------------------------------------------------------------
-- B. ĐỒNG BỘ BẢNG PROFILES — Supabase #1
--    Mọi user đã đăng nhập được đọc tên + avatar của nhau (chat, feed,
--    bình luận, thông báo) → không còn fallback "Người dùng"/avatar trắng.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Ghi: chỉ chính chủ.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
