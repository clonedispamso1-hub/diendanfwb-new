-- Add reply_to support to direct messages (Messenger/Telegram-style replies).
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to uuid NULL REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON public.messages(reply_to);
