-- ============================================================
-- Task #2 — Chat Reactions (Messenger style)
-- Table: public.message_reactions
-- Chạy trên Supabase project: zbuwddjcqdlyijcunwgd
-- Idempotent — có thể chạy nhiều lần an toàn.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','😢','😡')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_user_message_unique UNIQUE (message_id, user_id)
);

-- Indexes cho truy vấn realtime + list-by-message
CREATE INDEX IF NOT EXISTS message_reactions_message_id_idx
  ON public.message_reactions (message_id);
CREATE INDEX IF NOT EXISTS message_reactions_user_id_idx
  ON public.message_reactions (user_id);

-- Trigger cập nhật updated_at khi user đổi emoji (UPDATE thay vì INSERT)
CREATE OR REPLACE FUNCTION public.tg_message_reactions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_reactions_touch_updated_at ON public.message_reactions;
CREATE TRIGGER message_reactions_touch_updated_at
  BEFORE UPDATE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_message_reactions_touch_updated_at();

-- ============================================================
-- Grants (Data API — PostgREST)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

-- ============================================================
-- Row Level Security
-- Chỉ user tham gia cuộc chat (sender/receiver) mới đọc được reaction.
-- Chỉ chủ sở hữu mới INSERT/UPDATE/DELETE reaction của chính mình.
-- ============================================================
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Helper: user hiện tại có thể xem message này không?
CREATE OR REPLACE FUNCTION public.can_view_message(_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = _message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  );
$$;

DROP POLICY IF EXISTS "reactions_select_participants" ON public.message_reactions;
CREATE POLICY "reactions_select_participants"
  ON public.message_reactions
  FOR SELECT
  TO authenticated
  USING (public.can_view_message(message_id));

DROP POLICY IF EXISTS "reactions_insert_self" ON public.message_reactions;
CREATE POLICY "reactions_insert_self"
  ON public.message_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_view_message(message_id)
  );

DROP POLICY IF EXISTS "reactions_update_self" ON public.message_reactions;
CREATE POLICY "reactions_update_self"
  ON public.message_reactions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reactions_delete_self" ON public.message_reactions;
CREATE POLICY "reactions_delete_self"
  ON public.message_reactions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- Realtime: bật replica identity FULL + add vào publication
-- ============================================================
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions';
  END IF;
END $$;

-- ============================================================
-- DONE
-- ============================================================
