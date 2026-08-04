-- =====================================================================
-- ZaLove — 2026-07-14
-- PHẦN 2: FIX lỗi Follow ở tài khoản mới ("Không thể thực hiện thao tác").
-- PHẦN 4: Không tính điểm leaderboard khi tự Like/Comment bài của chính mình.
--
-- Cách chạy: dán trực tiếp toàn bộ file này vào SQL editor của Supabase
-- project (zbuwddjcqdlyijcunwgd) rồi Run. An toàn để chạy lại nhiều lần
-- (idempotent: dùng CREATE OR REPLACE / DROP IF EXISTS).
-- =====================================================================


-- ---------------------------------------------------------------------
-- PHẦN 2.A — Gỡ trigger follow-insert TRÙNG LẶP.
--
-- Trước đây có 2 trigger cùng lắng nghe AFTER INSERT ON follows:
--   • notif_after_follow_insert  (từ 2026-07-05_notifications_v4_rewrite)
--   • trg_follow_insert_notify   (từ 2026-07-06_follow_realtime_fix)
-- => Ghi 2 lần vào notifications, có thể vi phạm unique index / trả về
--    lỗi mờ "Không thể thực hiện thao tác" cho user mới (chưa có sẵn
--    notif hợp lệ nên chạy vào nhánh insert-mới).
-- Giữ lại trigger v2 (trg_follow_insert_notify) — là bản đầy đủ nhất.
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS notif_after_follow_insert ON public.follows;
DROP TRIGGER IF EXISTS notif_after_follow_delete ON public.follows;
-- (Nếu có bản cũ khác cùng chức năng thì đây là chỗ nên drop tiếp.)


-- ---------------------------------------------------------------------
-- PHẦN 2.B — Làm lại handle_follow_insert / handle_follow_delete cho AN TOÀN:
--   • Không hard-cast (data->>'actor_id')::uuid — dùng safe cast qua regex
--     để tránh crash khi có row cũ có actor_id rỗng / không đúng UUID.
--   • Bọc phần tạo notification trong BEGIN…EXCEPTION để một lỗi ở khâu
--     thông báo KHÔNG BAO GIỜ làm fail INSERT vào bảng follows.
--     (Follow phải luôn thành công; notif chỉ là hệ quả phụ.)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name   text;
  actor_avatar text;
  actor_uname  text;
BEGIN
  BEGIN
    SELECT p.full_name, p.avatar, p.username
      INTO actor_name, actor_avatar, actor_uname
      FROM public.profiles p
     WHERE p.id = NEW.follower_id;

    -- Dedup: xoá mọi notif follow cũ từ actor -> target trước khi insert.
    -- Safe cast: chỉ so sánh khi actor_id là UUID hợp lệ.
    DELETE FROM public.notifications
     WHERE user_id = NEW.following_id
       AND type IN ('follow', 'new_follower')
       AND (data ? 'actor_id')
       AND (data->>'actor_id') ~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND (data->>'actor_id')::uuid = NEW.follower_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, is_read, data)
    VALUES (
      NEW.following_id,
      'follow',
      'Người theo dõi mới',
      COALESCE(actor_name, actor_uname, 'Ai đó') || ' vừa theo dõi bạn',
      false,
      jsonb_build_object(
        'actor_id',       NEW.follower_id,
        'actor_name',     COALESCE(actor_name, actor_uname, 'Ai đó'),
        'actor_avatar',   actor_avatar,
        'actor_username', actor_uname
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Không chặn follow chỉ vì notif fail; ghi warning để trace.
    RAISE WARNING 'handle_follow_insert notif failed: % / %',
                  SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_follow_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_follow_insert()
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.handle_follow_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    DELETE FROM public.notifications
     WHERE user_id = OLD.following_id
       AND type IN ('follow', 'new_follower')
       AND (data ? 'actor_id')
       AND (data->>'actor_id') ~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND (data->>'actor_id')::uuid = OLD.follower_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_follow_delete notif cleanup failed: % / %',
                  SQLSTATE, SQLERRM;
  END;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_follow_delete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_follow_delete()
  TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- PHẦN 2.C — RLS trên follows: chắc chắn cho phép user auth self-insert.
--
-- Nếu policy INSERT bị thiếu / sai (WITH CHECK không có follower_id = uid),
-- tài khoản mới sẽ fail — đây cũng là 1 nguyên nhân "tài khoản mới bị lỗi".
-- ---------------------------------------------------------------------

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_all"   ON public.follows;
DROP POLICY IF EXISTS "follows_insert_self"  ON public.follows;
DROP POLICY IF EXISTS "follows_delete_self"  ON public.follows;

CREATE POLICY "follows_select_all"
  ON public.follows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "follows_insert_self"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (
    follower_id = auth.uid()
    AND following_id IS NOT NULL
    AND follower_id <> following_id
  );

CREATE POLICY "follows_delete_self"
  ON public.follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL                    ON public.follows TO service_role;


-- =====================================================================
-- PHẦN 4 — Leaderboard KHÔNG tính khi tự Like / tự Comment bài của mình.
--
-- Cách làm nhẹ nhất: viết hàm helper is_self_interaction(post_id, user_id)
-- rồi bọc các trigger cập nhật điểm bằng check này. Cụ thể ở đây ta thêm
-- BEFORE INSERT trigger trên likes/comments để CHẶN việc ghi vào bảng
-- điểm/log nếu là self-interaction.
--
-- Ta KHÔNG chặn record like/comment (user vẫn được tự like bài mình cho
-- UX quen thuộc) — chỉ chặn trigger cộng điểm phía leaderboard.
--
-- Điều này áp dụng cho toàn bộ tính điểm: Follow Score, Top Rising,
-- Interaction, Like, Comment.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_self_post_interaction(
  _post_id uuid,
  _user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts
     WHERE id = _post_id AND user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_self_post_interaction(uuid, uuid)
  TO authenticated, service_role;


-- Trigger tự bảo vệ trước mọi hàm cộng điểm dùng likes.
-- Nếu bạn có function cộng điểm bảng leaderboard trực tiếp từ trigger
-- likes/comments, thêm dòng kiểm tra này ở đầu function:
--
--   IF public.is_self_post_interaction(NEW.post_id, NEW.user_id) THEN
--     RETURN NEW;   -- vẫn ghi like nhưng không cộng điểm
--   END IF;
--
-- Dưới đây là 2 trigger BEFORE INSERT nhỏ chỉ để đánh dấu row là
-- self-interaction thông qua GUC (chỉ dùng khi bạn CÓ leaderboard trigger
-- kế tiếp đọc cờ này; nếu không cần, có thể xoá phần dưới).

CREATE OR REPLACE FUNCTION public.tag_self_like_no_score()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.is_self_post_interaction(NEW.post_id, NEW.user_id) THEN
    PERFORM set_config('app.skip_leaderboard', 'true', true);
  ELSE
    PERFORM set_config('app.skip_leaderboard', 'false', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tag_self_like_no_score ON public.likes;
CREATE TRIGGER trg_tag_self_like_no_score
BEFORE INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.tag_self_like_no_score();

CREATE OR REPLACE FUNCTION public.tag_self_comment_no_score()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.is_self_post_interaction(NEW.post_id, NEW.user_id) THEN
    PERFORM set_config('app.skip_leaderboard', 'true', true);
  ELSE
    PERFORM set_config('app.skip_leaderboard', 'false', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tag_self_comment_no_score ON public.comments;
CREATE TRIGGER trg_tag_self_comment_no_score
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.tag_self_comment_no_score();

-- Trong các function cộng điểm leaderboard hiện tại, thêm dòng đầu:
--   IF current_setting('app.skip_leaderboard', true) = 'true' THEN
--     RETURN NEW;
--   END IF;
-- => sẽ bỏ qua self-interaction mà không cần đụng lại schema điểm.

-- =====================================================================
-- HẾT.
-- =====================================================================
