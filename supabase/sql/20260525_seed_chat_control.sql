-- =========================================================================
-- 20260525_seed_chat_control.sql
-- Seed Account Chat Control · Soft delete · Typing · Realtime
--
-- CHẠY TAY trong Supabase SQL Editor. An toàn (IF NOT EXISTS, không xoá dữ
-- liệu, không phá schema cũ). Có thể chạy lại nhiều lần (idempotent).
--
-- Mục tiêu:
--   1. Soft-delete cho seed account (KHÔNG mất lịch sử chat của user thật).
--   2. Cờ admin_controlled để admin reply hộ nick ảo realtime.
--   3. Tracking online/typing ephemeral (dùng realtime broadcast, không cần
--      bảng riêng — chỉ cần bật realtime cho `messages`).
--   4. Bật realtime cho bảng messages để chat realtime tự nhiên.
--
-- Rollback friendly: tất cả cột thêm vào đều có DEFAULT, có thể DROP COLUMN
-- mà không ảnh hưởng dữ liệu cũ.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Soft-delete + admin-control cho fake_profiles (seed Nearby FWB)
-- -------------------------------------------------------------------------
ALTER TABLE public.fake_profiles
  ADD COLUMN IF NOT EXISTS seed_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS seed_deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_controlled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS admin_online BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_admin_reply_at TIMESTAMPTZ;

-- Ràng buộc giá trị seed_status (chỉ áp dụng nếu chưa có constraint).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fake_profiles_seed_status_chk'
  ) THEN
    ALTER TABLE public.fake_profiles
      ADD CONSTRAINT fake_profiles_seed_status_chk
      CHECK (seed_status IN ('active','inactive'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS fake_profiles_seed_status_idx
  ON public.fake_profiles (seed_status);

-- -------------------------------------------------------------------------
-- 2) Soft-delete tương tự cho profiles.is_virtual (nick ảo "có thể biết")
--    để chat-page hiển thị "Tài khoản đã ngừng hoạt động" thống nhất.
-- -------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seed_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS seed_deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_seed_status_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_seed_status_chk
      CHECK (seed_status IN ('active','inactive'));
  END IF;
END$$;

-- Index để filter nhanh nick ảo theo status.
CREATE INDEX IF NOT EXISTS profiles_virtual_status_idx
  ON public.profiles (is_virtual, seed_status)
  WHERE is_virtual = TRUE;

-- -------------------------------------------------------------------------
-- 3) Helper view: tất cả nick ảo (gộp profiles.is_virtual + fake_profiles)
--    Dùng cho admin chat panel.
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_seed_accounts AS
SELECT
  id::text                AS id,
  COALESCE(full_name, username)::text AS display_name,
  username::text          AS username,
  avatar::text            AS avatar,
  province::text          AS province,
  COALESCE(seed_status,'active')::text AS seed_status,
  seed_deleted_at,
  'profiles'::text        AS source_table
FROM public.profiles
WHERE is_virtual = TRUE
UNION ALL
SELECT
  id::text                AS id,
  COALESCE(display_name, full_name, username)::text AS display_name,
  username::text          AS username,
  COALESCE(avatar, avatar_url)::text AS avatar,
  province::text          AS province,
  COALESCE(seed_status,'active')::text AS seed_status,
  seed_deleted_at,
  'fake_profiles'::text   AS source_table
FROM public.fake_profiles
WHERE COALESCE(is_active, TRUE) = TRUE OR seed_status = 'inactive';

GRANT SELECT ON public.v_seed_accounts TO anon, authenticated;

-- -------------------------------------------------------------------------
-- 4) Index hỗ trợ admin chat panel (tìm nhanh conversation với seed).
--    Bảng `messages` đã có sẵn schema: {id, sender_id, receiver_id,
--    content, created_at, read_at?}. Chỉ thêm index nếu chưa có.
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS messages_receiver_created_idx
  ON public.messages (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON public.messages (sender_id, created_at DESC);

-- -------------------------------------------------------------------------
-- 5) BẬT REALTIME cho bảng messages
--    Sau khi chạy SQL này, vào Supabase Dashboard → Database → Replication
--    → bật "supabase_realtime" cho table `messages`.
--    HOẶC chạy đoạn ALTER PUBLICATION dưới đây (idempotent-ish):
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END$$;

-- -------------------------------------------------------------------------
-- 6) (Optional) Nếu sau này muốn lưu log admin-as-seed reply để audit:
--    Bỏ comment block dưới đây.
-- -------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS public.seed_admin_replies (
--   id BIGSERIAL PRIMARY KEY,
--   admin_id UUID NOT NULL,
--   seed_id  TEXT NOT NULL,
--   target_user_id UUID NOT NULL,
--   message_id BIGINT,
--   content TEXT,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS seed_admin_replies_admin_idx
--   ON public.seed_admin_replies (admin_id, created_at DESC);

-- =========================================================================
-- DONE. Sau khi chạy:
--   ✅ Có thể soft-delete seed (UPDATE fake_profiles SET seed_status='inactive')
--   ✅ Chat-page sẽ biết nick ảo nào đã ngừng hoạt động
--   ✅ Admin panel có view v_seed_accounts để list toàn bộ seed
--   ✅ Realtime cho messages đã bật
-- =========================================================================
