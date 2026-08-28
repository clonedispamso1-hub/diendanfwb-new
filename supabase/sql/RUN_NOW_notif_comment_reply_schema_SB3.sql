-- =====================================================================
-- SB3 (logs/social) — Notification comment/reply: KIỂM TRA SCHEMA TRƯỚC
-- KHI MIGRATE. Chạy được nhiều lần, không hỏng dữ liệu, không đụng SB1/SB2.
--
-- Mọi câu lệnh đều được bọc trong kiểm tra tồn tại:
--   • Không có bảng public.notifications  → thoát, KHÔNG tạo bảng mới.
--   • Cột/index đã có                     → bỏ qua.
-- =====================================================================

DO $$
DECLARE
  v_has_table  boolean;
  v_added      text[] := ARRAY[]::text[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) INTO v_has_table;

  IF NOT v_has_table THEN
    RAISE NOTICE '[SKIP] public.notifications không tồn tại trên instance này — không migrate.';
    RETURN;
  END IF;

  -- 1) post_id -------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'post_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN post_id uuid;
    v_added := v_added || 'post_id';
  END IF;

  -- 2) comment_id ----------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'comment_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN comment_id uuid;
    v_added := v_added || 'comment_id';
  END IF;

  -- 3) is_pending_claim (badge Gift tách riêng khỏi badge unread) -----
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_pending_claim'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN is_pending_claim boolean NOT NULL DEFAULT false;
    v_added := v_added || 'is_pending_claim';
  END IF;

  RAISE NOTICE '[OK] Cột đã thêm: %', COALESCE(array_to_string(v_added, ', '), '(không có)');
END $$;

-- 4) Backfill từ JSON `data` cho các hàng cũ (chỉ khi cột đã tồn tại).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'post_id'
  ) THEN
    UPDATE public.notifications
       SET post_id = NULLIF(data->>'post_id', '')::uuid
     WHERE post_id IS NULL
       AND data ? 'post_id'
       AND NULLIF(data->>'post_id', '') ~ '^[0-9a-fA-F-]{36}$';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'comment_id'
  ) THEN
    UPDATE public.notifications
       SET comment_id = NULLIF(data->>'comment_id', '')::uuid
     WHERE comment_id IS NULL
       AND data ? 'comment_id'
       AND NULLIF(data->>'comment_id', '') ~ '^[0-9a-fA-F-]{36}$';
  END IF;
END $$;

-- 5) Index phục vụ badge (unread) và badge Gift (pending) — tách riêng.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_read'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
      ON public.notifications (user_id, created_at DESC)
      WHERE is_read = false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_pending_claim'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_user_pending_gift
      ON public.notifications (user_id, created_at DESC)
      WHERE is_pending_claim = true;
  END IF;
END $$;

-- 6) Dọn thông báo trỏ tới comment KHÔNG CÒN TỒN TẠI (chỉ khi bảng
--    public.comments nằm cùng instance này).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'comments'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'comment_id'
  ) THEN
    DELETE FROM public.notifications n
     WHERE n.comment_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.comments c WHERE c.id = n.comment_id)
       AND COALESCE(n.is_pending_claim, false) = false;
  ELSE
    RAISE NOTICE '[SKIP] Không dọn được notification comment mồ côi (thiếu bảng comments hoặc cột comment_id).';
  END IF;
END $$;
