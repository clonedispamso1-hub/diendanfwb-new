-- =====================================================================
-- RUN THIS SQL ON YOUR EXISTING SUPABASE PROJECT
-- (SQL Editor → New query → paste and run)
--
-- Per-user "clear conversation" markers, mirroring Messenger/Zalo semantics.
-- Each row: user_id has cleared their view of the DM with partner_id at
-- cleared_at. Messages are shown only when created_at > cleared_at.
-- Chat rows in the inbox reappear when a new message arrives after that
-- moment; the other side is never affected.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.conversation_clears (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id  uuid        NOT NULL,
  cleared_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_clears TO authenticated;
GRANT ALL ON public.conversation_clears TO service_role;

ALTER TABLE public.conversation_clears ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conv_clears_select_own" ON public.conversation_clears;
CREATE POLICY "conv_clears_select_own" ON public.conversation_clears
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "conv_clears_insert_own" ON public.conversation_clears;
CREATE POLICY "conv_clears_insert_own" ON public.conversation_clears
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conv_clears_update_own" ON public.conversation_clears;
CREATE POLICY "conv_clears_update_own" ON public.conversation_clears
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conv_clears_delete_own" ON public.conversation_clears;
CREATE POLICY "conv_clears_delete_own" ON public.conversation_clears
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_conv_clears_user ON public.conversation_clears(user_id);
