-- ============================================================
-- ZaLove — DỌN DẸP DỮ LIỆU LỊCH SỬ / HÀNG ĐỢI CỦA BOT (2026-08-19)
-- Chạy trên Supabase SQL Editor. Idempotent, chạy lại an toàn.
--
-- AN TOÀN TUYỆT ĐỐI:
--   Hàm này CHỈ xóa bản ghi quản lý công việc (task/queue/history) trong các
--   bảng bot: scheduled_tasks, scheduled_jobs, scenario_comment_tasks,
--   clone_follow_tasks.
--   KHÔNG bao giờ xóa: public.posts, public.comments, public.follows
--   (bài viết, bình luận, lượt theo dõi đã thực thi vẫn giữ nguyên).
-- ============================================================

CREATE OR REPLACE FUNCTION public.clear_bot_scenario_data(p_tab text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tab    text := lower(coalesce(p_tab, 'all'));
  result   jsonb := '{}'::jsonb;
  n        bigint;
BEGIN
  -- Chỉ Admin được phép gọi
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_tab NOT IN ('posts', 'comments', 'follows', 'all') THEN
    RAISE EXCEPTION 'p_tab không hợp lệ (posts | comments | follows | all)'
      USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------
  -- KỊCH BẢN UP BÀI — hàng đợi & job (KHÔNG đụng public.posts)
  ---------------------------------------------------------------
  IF v_tab IN ('posts', 'all') THEN
    -- Xóa comment task trước để không vướng khóa ngoại tới scheduled_tasks
    IF to_regclass('public.scenario_comment_tasks') IS NOT NULL THEN
      DELETE FROM public.scenario_comment_tasks;
      GET DIAGNOSTICS n = ROW_COUNT;
      result := result || jsonb_build_object('scenario_comment_tasks', n);
    END IF;

    IF to_regclass('public.scheduled_tasks') IS NOT NULL THEN
      DELETE FROM public.scheduled_tasks;
      GET DIAGNOSTICS n = ROW_COUNT;
      result := result || jsonb_build_object('scheduled_tasks', n);
    END IF;

    IF to_regclass('public.scheduled_jobs') IS NOT NULL THEN
      DELETE FROM public.scheduled_jobs;
      GET DIAGNOSTICS n = ROW_COUNT;
      result := result || jsonb_build_object('scheduled_jobs', n);
    END IF;
  END IF;

  ---------------------------------------------------------------
  -- KỊCH BẢN BÌNH LUẬN — chỉ task (KHÔNG đụng public.comments)
  ---------------------------------------------------------------
  IF v_tab = 'comments' THEN
    IF to_regclass('public.scenario_comment_tasks') IS NOT NULL THEN
      DELETE FROM public.scenario_comment_tasks;
      GET DIAGNOSTICS n = ROW_COUNT;
      result := result || jsonb_build_object('scenario_comment_tasks', n);
    END IF;
  END IF;

  ---------------------------------------------------------------
  -- THEO DÕI USER — chỉ task (KHÔNG đụng public.follows)
  ---------------------------------------------------------------
  IF v_tab IN ('follows', 'all') THEN
    IF to_regclass('public.clone_follow_tasks') IS NOT NULL THEN
      DELETE FROM public.clone_follow_tasks;
      GET DIAGNOSTICS n = ROW_COUNT;
      result := result || jsonb_build_object('clone_follow_tasks', n);
    END IF;
  END IF;

  RETURN result || jsonb_build_object('tab', v_tab, 'cleared_at', now());
END $$;

REVOKE ALL ON FUNCTION public.clear_bot_scenario_data(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_bot_scenario_data(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_bot_scenario_data(text) TO service_role;

-- Ví dụ:
-- SELECT public.clear_bot_scenario_data('posts');
-- SELECT public.clear_bot_scenario_data('comments');
-- SELECT public.clear_bot_scenario_data('follows');
-- SELECT public.clear_bot_scenario_data('all');
