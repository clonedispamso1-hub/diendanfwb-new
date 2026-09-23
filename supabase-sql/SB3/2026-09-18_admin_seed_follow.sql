-- =====================================================================
-- SUPABASE #3 (logs/content) — RPC cho tính năng "Theo dõi – Seeding".
--
-- Mục tiêu: cho phép Admin ra lệnh 1 tài khoản thứ hai (clone) theo dõi
-- 1 user thật, TÁI SỬ DỤNG bảng `follows` + `notifications` hiện có.
-- KHÔNG tạo bảng follow/notification mới.
--
-- Chạy thủ công trong Supabase SQL Editor của project #3. Idempotent.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_seed_follow(
  p_clone_id  uuid,
  p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int := 0;
  v_notif_id uuid;
BEGIN
  IF p_clone_id IS NULL OR p_target_id IS NULL OR p_clone_id = p_target_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_params');
  END IF;

  -- 1) Quan hệ follow (dùng đúng bảng follows hiện có).
  INSERT INTO public.follows (follower_id, following_id)
  VALUES (p_clone_id, p_target_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- 2) Thông báo cho user thật — nằm trong hệ thống notification bình thường.
  --    kind = 'follow_seed' để tách khỏi luồng follow tự động đang bị ẩn,
  --    data.open = 'followers' → client mở danh sách người theo dõi.
  INSERT INTO public.notifications (
    user_id, type, kind, title, message,
    actor_ids, actors_count, last_actor_id,
    is_read, data
  ) VALUES (
    p_target_id, 'follow_seed', 'follow_seed',
    NULL, 'đã theo dõi bạn',
    ARRAY[p_clone_id], 1, p_clone_id,
    false,
    jsonb_build_object('open', 'followers', 'follower_id', p_clone_id, 'seeded', true)
  )
  RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object('ok', true, 'followed', v_rows > 0, 'notification_id', v_notif_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_seed_follow(uuid, uuid)
  TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
