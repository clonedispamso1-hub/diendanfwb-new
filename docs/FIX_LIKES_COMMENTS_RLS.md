# Fix RLS + Realtime cho `likes` & `comments`

Vì dự án dùng lại Supabase project cũ (`zbuwddjcqdlyijcunwgd`), Lovable không thể tự chạy migration. Hãy mở **Supabase Dashboard → SQL Editor** của project đó và dán nguyên block dưới đây, bấm **Run**.

```sql
-- 1) Bật RLS
ALTER TABLE public.likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 2) Grants cho Data API (PostgREST)
GRANT SELECT, INSERT, DELETE        ON public.likes    TO authenticated;
GRANT SELECT                        ON public.likes    TO anon;
GRANT ALL                           ON public.likes    TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT                         ON public.comments TO anon;
GRANT ALL                            ON public.comments TO service_role;

-- 3) Policies — LIKES (user chỉ thao tác trên lượt tim của chính mình)
DROP POLICY IF EXISTS "likes_select_all"  ON public.likes;
DROP POLICY IF EXISTS "likes_insert_self" ON public.likes;
DROP POLICY IF EXISTS "likes_delete_self" ON public.likes;

CREATE POLICY "likes_select_all"  ON public.likes
  FOR SELECT  USING (true);
CREATE POLICY "likes_insert_self" ON public.likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete_self" ON public.likes
  FOR DELETE TO authenticated USING  (auth.uid() = user_id);

-- 4) Policies — COMMENTS
DROP POLICY IF EXISTS "comments_select_all"  ON public.comments;
DROP POLICY IF EXISTS "comments_insert_self" ON public.comments;
DROP POLICY IF EXISTS "comments_update_self" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_self" ON public.comments;

CREATE POLICY "comments_select_all"  ON public.comments
  FOR SELECT  USING (true);
CREATE POLICY "comments_insert_self" ON public.comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_update_self" ON public.comments
  FOR UPDATE TO authenticated USING  (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_self" ON public.comments
  FOR DELETE TO authenticated USING  (auth.uid() = user_id);

-- 5) Realtime: thêm bảng vào publication + bật REPLICA IDENTITY FULL
ALTER TABLE public.likes    REPLICA IDENTITY FULL;
ALTER TABLE public.comments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='likes'
  ) THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.likes'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='comments'
  ) THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.comments'; END IF;
END $$;
```

## Cột `user_id` phải đúng tên

Các policy ở trên giả định cột chủ sở hữu là `user_id`. Nếu schema của bạn dùng tên khác (vd `author_id`), thay `user_id` → tên cột thực tế.

## Kiểm tra nhanh

Sau khi chạy SQL xong, mở DevTools → tab Network, thả tim 1 bài rồi F5: request `POST /rest/v1/likes` phải trả `201`, không phải `401/403/42501`. Nếu vẫn lỗi → kiểm tra lại tên cột owner.
