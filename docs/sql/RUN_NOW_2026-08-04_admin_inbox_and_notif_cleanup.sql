-- =====================================================================
-- CHẠY 1 LẦN TRONG SUPABASE SQL EDITOR (DB đang dùng cho Admin Panel)
-- 1) Hộp thư clone: sắp xếp theo "ai vừa nhắn mới nhất" + badge đỏ.
-- 2) Nút "Xóa tất cả thông báo" (chỉ xoá thông báo / cờ chưa đọc,
--    KHÔNG xoá nội dung chat).
-- 3) Tự dọn thông báo cũ hơn 7 ngày (cron) → database nhẹ.
-- An toàn chạy lại nhiều lần.
-- =====================================================================

-- ---------- Index cho sắp xếp/đếm nhanh ----------
CREATE INDEX IF NOT EXISTS messages_receiver_created_idx
  ON public.messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

-- ---------- 1) Hộp thư: unread + thời điểm tin mới nhất ----------
DROP FUNCTION IF EXISTS public.admin_internal_inbox_by_account();
CREATE OR REPLACE FUNCTION public.admin_internal_inbox_by_account()
RETURNS TABLE (account_id uuid, unread bigint, last_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT pr.id,
         count(m.id) FILTER (WHERE coalesce(m.is_read,false) = false)::bigint,
         max(m.created_at)
    FROM public.profiles pr
    LEFT JOIN public.messages m ON m.receiver_id = pr.id
   WHERE pr.account_source = 'internal'
   GROUP BY pr.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_inbox_by_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_inbox_by_account() TO authenticated;

-- ---------- 2a) Xoá tất cả thông báo tin nhắn (chỉ tắt badge) ----------
DROP FUNCTION IF EXISTS public.admin_internal_mark_all_read();
CREATE OR REPLACE FUNCTION public.admin_internal_mark_all_read()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.messages m
     SET is_read = true
   WHERE coalesce(m.is_read,false) = false
     AND m.receiver_id IN (SELECT pr.id FROM public.profiles pr WHERE pr.account_source = 'internal');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;   -- nội dung chat GIỮ NGUYÊN
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_mark_all_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_mark_all_read() TO authenticated;

-- ---------- 2b) Xoá tất cả thông báo của clone ----------
DROP FUNCTION IF EXISTS public.admin_internal_notif_clear_all(uuid);
CREATE OR REPLACE FUNCTION public.admin_internal_notif_clear_all(p_account uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.notifications nt
   WHERE (p_account IS NOT NULL AND nt.user_id = p_account)
      OR (p_account IS NULL AND nt.user_id IN
            (SELECT pr.id FROM public.profiles pr WHERE pr.account_source = 'internal'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_notif_clear_all(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_notif_clear_all(uuid) TO authenticated;

-- ---------- 3) Tự dọn thông báo quá 7 ngày ----------
CREATE OR REPLACE FUNCTION public.purge_old_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.notifications WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_old_notifications() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('purge-old-notifications')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-notifications');
SELECT cron.schedule('purge-old-notifications', '15 3 * * *',
  $$select public.purge_old_notifications();$$);

NOTIFY pgrst, 'reload schema';
