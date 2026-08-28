-- ============================================================
-- CHẠY FILE NÀY TRÊN SUPABASE #3 (logs/social)
-- URL: https://uaqsetfdciyzxpuhulux.supabase.co  →  SQL Editor → Run
-- Lý do: bảng posts / comments nằm ở Supabase #3 (MODULE_DB.feed = "logs").
-- KHÔNG chạy trên Supabase #1 / #2. Không đổi URL hay API key.
-- Nội dung: (1) RPC ghim bài  (2) khóa bình luận có chặn ở DB.
-- ============================================================

-- ---------- 1. Cột cần thiết (an toàn nếu đã có) ----------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at         timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_until      timestamptz,
  ADD COLUMN IF NOT EXISTS comments_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at         timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason     text;

CREATE INDEX IF NOT EXISTS idx_posts_pinned
  ON public.posts (is_pinned, pinned_at DESC)
  WHERE is_pinned = true;

-- ---------- 2. RPC: GHIM / BỎ GHIM ----------
-- Signature đúng như client đang gọi: admin_pin_post(p_post_id, p_hours).
-- p_hours > 0  → ghim trong N giờ (NULL/0 → bỏ ghim).
DROP FUNCTION IF EXISTS public.admin_pin_post(uuid, integer);
DROP FUNCTION IF EXISTS public.admin_pin_post(uuid, int8);

CREATE OR REPLACE FUNCTION public.admin_pin_post(
  p_post_id uuid,
  p_hours   integer DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  is_pinned    boolean,
  pinned_at    timestamptz,
  pinned_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin boolean := COALESCE(p_hours, 0) > 0;
BEGIN
  RETURN QUERY
  UPDATE public.posts p
     SET is_pinned    = v_pin,
         pinned_at    = CASE WHEN v_pin THEN COALESCE(p.pinned_at, now()) ELSE NULL END,
         pinned_until = CASE WHEN v_pin THEN now() + make_interval(hours => p_hours) ELSE NULL END
   WHERE p.id = p_post_id
  RETURNING p.id, p.is_pinned, p.pinned_at, p.pinned_until;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bài viết %', p_post_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_pin_post(uuid, integer) TO authenticated, service_role;

-- ---------- 3. RPC: KHÓA / MỞ BÌNH LUẬN ----------
DROP FUNCTION IF EXISTS public.admin_set_comments_disabled(uuid, boolean);

CREATE OR REPLACE FUNCTION public.admin_set_comments_disabled(
  p_post_id  uuid,
  p_disabled boolean
)
RETURNS TABLE (id uuid, comments_disabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.posts p
     SET comments_disabled = COALESCE(p_disabled, false)
   WHERE p.id = p_post_id
  RETURNING p.id, p.comments_disabled;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bài viết %', p_post_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_comments_disabled(uuid, boolean) TO authenticated, service_role;

-- ---------- 4. RPC: KHÓA / MỞ BÀI (dùng chung, giữ nguyên hành vi cũ) ----------
DROP FUNCTION IF EXISTS public.admin_lock_post(uuid, boolean);

CREATE OR REPLACE FUNCTION public.admin_lock_post(
  p_post_id uuid,
  p_lock    boolean
)
RETURNS TABLE (id uuid, is_locked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.posts p
     SET is_locked  = COALESCE(p_lock, false),
         locked_at  = CASE WHEN COALESCE(p_lock, false) THEN now() ELSE NULL END
   WHERE p.id = p_post_id
  RETURNING p.id, p.is_locked;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bài viết %', p_post_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_lock_post(uuid, boolean) TO authenticated, service_role;

-- ---------- 5. CHẶN BÌNH LUẬN Ở DB (không thể bypass bằng client khác) ----------
-- Không xóa comment cũ — chỉ chặn INSERT mới khi bài đã khóa bình luận / khóa bài.
CREATE OR REPLACE FUNCTION public.enforce_comments_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disabled boolean;
  v_locked   boolean;
BEGIN
  SELECT COALESCE(comments_disabled, false), COALESCE(is_locked, false)
    INTO v_disabled, v_locked
    FROM public.posts
   WHERE id = NEW.post_id;

  IF v_disabled OR v_locked THEN
    RAISE EXCEPTION 'COMMENTS_LOCKED: Bài viết này đã khóa bình luận.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_comments_lock ON public.comments;
CREATE TRIGGER trg_enforce_comments_lock
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_comments_lock();
