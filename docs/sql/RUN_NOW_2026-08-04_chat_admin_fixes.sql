-- =====================================================================
-- CHẠY 1 LẦN TRONG SUPABASE SQL EDITOR (DB chính đang dùng)
-- Sửa: (3) nút "Xóa tất cả thông báo", (4) ai nhắn mới nhất lên đầu,
--       (5) badge đỏ tăng lại đúng, (6) tab Thông báo của clone có dữ liệu.
-- KHÔNG đổi URL / API key, KHÔNG xoá nội dung chat. Chạy lại nhiều lần OK.
-- =====================================================================

CREATE INDEX IF NOT EXISTS messages_receiver_created_idx
  ON public.messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

-- (4) Hộp thư clone: unread + thời điểm tin mới nhất -------------------
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

-- (3)(5) Đánh dấu đã đọc toàn bộ tin nhắn của clone (giữ nguyên nội dung)
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
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_mark_all_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_mark_all_read() TO authenticated;

-- (6) Thông báo của clone: đếm + danh sách (mọi loại thông báo) --------
DROP FUNCTION IF EXISTS public.admin_internal_notif_counts();
CREATE OR REPLACE FUNCTION public.admin_internal_notif_counts()
RETURNS TABLE (account_id uuid, unread bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT pr.id,
         (SELECT count(*) FROM public.notifications n
           WHERE n.user_id = pr.id AND coalesce(n.is_read,false) = false)::bigint
    FROM public.profiles pr
   WHERE pr.account_source = 'internal';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_notif_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_notif_counts() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_internal_notifications(uuid,int);
CREATE OR REPLACE FUNCTION public.admin_internal_notifications(
  p_account uuid, p_limit int DEFAULT 100
) RETURNS TABLE (
  id uuid, type text, title text, message text, data jsonb,
  is_read boolean, created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT n.id, n.type::text, n.title, n.message, coalesce(n.data,'{}'::jsonb),
         coalesce(n.is_read,false), n.created_at
    FROM public.notifications n
   WHERE n.user_id = p_account
   ORDER BY n.created_at DESC
   LIMIT greatest(coalesce(p_limit,100),1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_notifications(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_notifications(uuid,int) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_internal_notif_mark_read(uuid,uuid);
CREATE OR REPLACE FUNCTION public.admin_internal_notif_mark_read(
  p_account uuid, p_id uuid DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.notifications
     SET is_read = true
   WHERE user_id = p_account AND coalesce(is_read,false) = false
     AND (p_id IS NULL OR id = p_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_notif_mark_read(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_notif_mark_read(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
