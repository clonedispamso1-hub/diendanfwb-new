-- =====================================================================
-- 2026-07-13 — REMOVE Like Notifications completely
-- ---------------------------------------------------------------------
-- Yêu cầu:
--   • BỎ hoàn toàn notification loại Like (bao gồm self-like, like-lại,
--     aggregate…). DB không lưu, client không hiển thị, realtime không
--     phát, badge không tăng.
--   • Không ảnh hưởng: chat, wallet, leaderboard, follow, comment,
--     reply, gem transfer, admin trust adjust, system.
-- ---------------------------------------------------------------------
-- KHÔNG DROP DỮ LIỆU KHÁC. Chỉ xoá trigger/function/notification thuộc
-- domain Like.
-- =====================================================================

BEGIN;

-- 1) Drop trigger cắm vào bảng public.likes (nếu tồn tại)
DO $$
BEGIN
  IF to_regclass('public.likes') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS notif_after_like_insert ON public.likes';
    EXECUTE 'DROP TRIGGER IF EXISTS notif_after_like_delete ON public.likes';
    EXECUTE 'DROP TRIGGER IF EXISTS notif_after_like_update ON public.likes';
  END IF;
END $$;

-- 2) Drop toàn bộ function được trigger Like sử dụng (idempotent)
DROP FUNCTION IF EXISTS public.trg_notif_after_like_insert()           CASCADE;
DROP FUNCTION IF EXISTS public.trg_notif_after_like_delete()           CASCADE;
DROP FUNCTION IF EXISTS public.trg_notif_after_like_aggregate()        CASCADE;
DROP FUNCTION IF EXISTS public.notif_after_like_insert()               CASCADE;
DROP FUNCTION IF EXISTS public.notif_like_upsert(uuid, uuid)           CASCADE;

-- 3) Xoá dữ liệu notification loại Like đã insert trước đây (mọi biến thể type/kind)
DELETE FROM public.notifications
WHERE lower(coalesce(kind, ''))  IN ('like', 'like_post', 'post_like')
   OR lower(coalesce(type, ''))  IN ('like', 'like_post', 'post_like');

COMMIT;

-- =====================================================================
-- Sau khi chạy migration:
--   • Like bài viết không còn insert vào public.notifications.
--   • Notification cũ loại Like đã bị xoá → panel/badge/popup không hiện.
--   • Các trigger comment/comment_reply/follow/gem_tx vẫn hoạt động
--     bình thường (v4 rewrite giữ nguyên).
-- =====================================================================
