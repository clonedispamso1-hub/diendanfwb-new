-- ============================================================
-- ZaLove — FINAL PERFORMANCE & BLOAT AUDIT (2026-08-19)
-- CHẠY THỦ CÔNG trên Supabase SQL Editor. Idempotent, chạy lại an toàn.
-- Không đổi schema/RLS/dữ liệu người dùng (ngoài phần dọn rác có chủ đích).
-- ============================================================

-- ------------------------------------------------------------
-- PHẦN 1 — INDEX CHO CÁC TRUY VẤN ILIKE / SEARCH
-- Frontend đang tra cứu: profiles.username, profiles.public_id,
-- profiles.full_name, posts.content, gif_library.label bằng ILIKE.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Chỉ tạo index khi bảng + cột thật sự tồn tại (an toàn khi chạy lại).
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    FOR r IN
      SELECT * FROM (VALUES
        ('idx_profiles_lower_username',  'username',  'btree'),
        ('idx_profiles_lower_public_id', 'public_id', 'btree'),
        ('idx_profiles_lower_full_name', 'full_name', 'btree'),
        ('idx_profiles_full_name_trgm',  'full_name', 'trgm'),
        ('idx_profiles_phone_trgm',      'phone',     'trgm')
      ) AS t(idx, col, kind)
    LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = r.col
      ) THEN
        IF r.kind = 'btree' THEN
          EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.profiles (lower(%I))', r.idx, r.col);
        ELSE
          EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.profiles USING gin (%I gin_trgm_ops)', r.idx, r.col);
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF to_regclass('public.gif_library') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gif_library' AND column_name = 'label'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_gif_library_label_trgm
             ON public.gif_library USING gin (label gin_trgm_ops)';
  END IF;
END $$;


-- ------------------------------------------------------------
-- PHẦN 2 — INDEX CHO LIST/FILTER NẶNG CÒN THIẾU
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_pair_created
             ON public.messages (sender_id, receiver_id, created_at DESC)';
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_unread
             ON public.notifications (user_id, created_at DESC)
             WHERE is_read = false';
  END IF;

  IF to_regclass('public.stories') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stories_user_expires
             ON public.stories (user_id, expires_at DESC)';
  END IF;

  IF to_regclass('public.reports') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reports_status_created
             ON public.reports (status, created_at DESC)';
  END IF;

  IF to_regclass('public.withdrawal_requests') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created
             ON public.withdrawal_requests (status, created_at DESC)';
  END IF;

  -- connection_requests: tên cột "người nhận" khác nhau tùy phiên bản schema.
  -- Dò cột thật trong information_schema rồi mới tạo index (bỏ qua nếu không có).
  IF to_regclass('public.connection_requests') IS NOT NULL THEN
    DECLARE
      v_target text;
      v_cols   text[] := ARRAY[]::text[];
    BEGIN
      SELECT c.column_name INTO v_target
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'connection_requests'
        AND c.column_name IN ('target_id', 'receiver_id', 'to_user_id')
      ORDER BY array_position(
        ARRAY['target_id', 'receiver_id', 'to_user_id'], c.column_name::text)
      LIMIT 1;

      IF v_target IS NOT NULL THEN
        v_cols := array_append(v_cols, quote_ident(v_target));

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'connection_requests'
            AND column_name = 'status'
        ) THEN
          v_cols := array_append(v_cols, 'status');
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'connection_requests'
            AND column_name = 'created_at'
        ) THEN
          v_cols := array_append(v_cols, 'created_at DESC');
        END IF;

        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS idx_connection_requests_target_status ON public.connection_requests (%s)',
          array_to_string(v_cols, ', ')
        );
      ELSE
        RAISE NOTICE 'connection_requests: không tìm thấy cột target_id/receiver_id/to_user_id — bỏ qua index.';
      END IF;
    END;
  END IF;
END $$;


-- ------------------------------------------------------------
-- PHẦN 3 — DỌN BLOAT (log / history / dữ liệu hết hạn)
-- Gọi thủ công hoặc lên lịch pg_cron mỗi ngày.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_bloat_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  n bigint;
BEGIN
  -- Thông báo đã đọc > 30 ngày, chưa đọc > 90 ngày
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications
      WHERE created_at < now() - interval '30 days'
      AND coalesce(is_read, false) = true;
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('notifications_read', n);
    DELETE FROM public.notifications WHERE created_at < now() - interval '90 days';
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('notifications_old', n);
  END IF;

  -- Nhật ký hoạt động người dùng > 60 ngày
  IF to_regclass('public.activity_log') IS NOT NULL THEN
    DELETE FROM public.activity_log WHERE created_at < now() - interval '60 days';
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('activity_log', n);
  END IF;

  -- Log agent/bot > 30 ngày
  IF to_regclass('public.agent_activity_logs') IS NOT NULL THEN
    DELETE FROM public.agent_activity_logs WHERE created_at < now() - interval '30 days';
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('agent_activity_logs', n);
  END IF;

  -- Log admin > 180 ngày (giữ lâu hơn cho mục đích kiểm toán)
  IF to_regclass('public.admin_logs') IS NOT NULL THEN
    DELETE FROM public.admin_logs WHERE created_at < now() - interval '180 days';
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('admin_logs', n);
  END IF;

  -- Lượt xem bài / video > 90 ngày (chỉ dùng để đếm gần đây)
  IF to_regclass('public.post_views') IS NOT NULL THEN
    DELETE FROM public.post_views WHERE created_at < now() - interval '90 days';
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('post_views', n);
  END IF;
  IF to_regclass('public.video_views') IS NOT NULL THEN
    DELETE FROM public.video_views WHERE created_at < now() - interval '90 days';
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('video_views', n);
  END IF;

  -- Log trò chơi > 30 ngày
  IF to_regclass('public.dice_logs') IS NOT NULL THEN
    DELETE FROM public.dice_logs WHERE created_at < now() - interval '30 days';
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('dice_logs', n);
  END IF;

  -- Story hết hạn > 2 ngày (edge function cleanup-stories là lớp chính)
  IF to_regclass('public.stories') IS NOT NULL THEN
    DELETE FROM public.stories WHERE expires_at < now() - interval '2 days';
    GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('stories', n);
  END IF;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.purge_bloat_tables() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_bloat_tables() TO service_role;

-- Lên lịch hằng ngày 03:15 UTC (bỏ comment nếu đã bật pg_cron)
-- SELECT cron.schedule('purge-bloat-daily', '15 3 * * *', $$SELECT public.purge_bloat_tables()$$);

-- Chạy ngay một lần:
-- SELECT public.purge_bloat_tables();

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN EXECUTE 'ANALYZE public.profiles'; END IF;
  IF to_regclass('public.posts') IS NOT NULL THEN EXECUTE 'ANALYZE public.posts'; END IF;
END $$;
