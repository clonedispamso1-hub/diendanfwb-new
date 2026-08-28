-- =====================================================================
-- 🩹 FIX: Supabase #1 (gxfxqbhxoghdhokwjpex) thiếu cột trên public.profiles
--
-- NGUYÊN NHÂN GỐC của lỗi "Không tìm thấy hồ sơ" + treo màn loading sau
-- onboarding: bảng `profiles` của project SB1 mới (INIT_CLEAN_SB1.sql) chỉ có
-- tập cột rút gọn. App select các cột không tồn tại → PostgREST trả HTTP 400
-- (Postgres 42703 "column profiles.<x> does not exist") → loadProfile / verify
-- onboarding trả null → app tưởng chưa có hồ sơ.
--
-- Đã kiểm chứng bằng REST (anon key) ngày 2026-08-23: 36 cột dưới đây trả 400,
-- trong đó QUAN TRỌNG NHẤT là `is_onboarding_completed` (cờ hoàn tất onboarding
-- không thể lưu → onboarding lặp lại / treo).
--
-- CÁCH DÙNG: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- File idempotent, chạy lại nhiều lần an toàn, KHÔNG xoá dữ liệu cũ.
-- =====================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email                     text,
  ADD COLUMN IF NOT EXISTS is_onboarding_completed   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status           text        NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS device_account_index      integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS permanent_banned          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_status            text        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS account_source            text,
  ADD COLUMN IF NOT EXISTS badge_id                  text,
  ADD COLUMN IF NOT EXISTS nickname                  text,
  ADD COLUMN IF NOT EXISTS birthday                  date,
  ADD COLUMN IF NOT EXISTS zodiac                    text,
  ADD COLUMN IF NOT EXISTS relationship_status       text,
  ADD COLUMN IF NOT EXISTS personality_tags          text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS communication_styles      text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interests                 text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goal                      text,
  ADD COLUMN IF NOT EXISTS target_gender             text,
  ADD COLUMN IF NOT EXISTS preferred_language        text,
  ADD COLUMN IF NOT EXISTS region                    text,
  ADD COLUMN IF NOT EXISTS facebook                  text,
  ADD COLUMN IF NOT EXISTS zalo                      text,
  ADD COLUMN IF NOT EXISTS height                    integer,
  ADD COLUMN IF NOT EXISTS weight                    integer,
  ADD COLUMN IF NOT EXISTS photos                    jsonb       DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS title_gif_url             text,
  ADD COLUMN IF NOT EXISTS is_fwb_active             boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_ready            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_last_changed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS location_change_count     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intent_locked_until       timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen                 timestamptz,
  ADD COLUMN IF NOT EXISTS last_ip                   text,
  ADD COLUMN IF NOT EXISTS name_changes              integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_name_change          timestamptz,
  ADD COLUMN IF NOT EXISTS vip_exp                   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reputation_score          integer     NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS password                  text;

-- Backfill: hồ sơ cũ đã có dữ liệu coi như đã onboarding xong (tránh bắt lại).
UPDATE public.profiles
   SET is_onboarding_completed = true
 WHERE is_onboarding_completed = false
   AND gender IS NOT NULL
   AND (province IS NOT NULL OR location IS NOT NULL);

-- Đồng bộ email từ auth.users (app dùng fake email <username>@fwb.local).
UPDATE public.profiles p
   SET email = u.email
  FROM auth.users u
 WHERE u.id = p.id
   AND p.email IS DISTINCT FROM u.email;

-- Data API grants (bắt buộc, PostgREST không tự cấp).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;

COMMIT;

-- Kiểm tra nhanh sau khi chạy:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='profiles' ORDER BY 1;
