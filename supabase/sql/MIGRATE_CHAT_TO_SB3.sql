-- =====================================================================
-- MIGRATE MODULE CHAT / MESSENGER → SUPABASE #3 (uaqsetfdciyzxpuhulux)
-- Chạy TOÀN BỘ file này trong SQL Editor của SUPABASE 3.
-- An toàn khi chạy lại nhiều lần (IF NOT EXISTS / CREATE OR REPLACE).
--
-- Mục tiêu: đưa toàn bộ luồng Chat/Messenger (kể cả Tab "Tin nhắn" trong
-- Admin Panel) sang Supabase 3 → egress chat trên Supabase 1 = 0.
--
-- LƯU Ý KIẾN TRÚC:
--   • auth.users + public.profiles VẪN ở Supabase 1 (bàn thờ hệ thống).
--     Vì vậy các bảng dưới đây KHÔNG có FK xuyên project: user_id /
--     sender_id / receiver_id chỉ là khoá logic (uuid).
--   • Người dùng đăng nhập ở #1 (ES256 + kid) nên #3 chưa verify được token
--     của #1 → client #3 dùng publishable/anon key + policy `*_anon_bridge`
--     (xem supabase-sql/s3/020_chat_anon_bridge.sql). Khi #3 bật Third-Party
--     Auth trỏ JWKS của #1: DROP các policy bridge và siết lại theo auth.uid().
--   • Các RPC quản trị bên dưới KHÔNG join public.profiles (không tồn tại ở
--     #3). Chúng chỉ trả về id + số liệu; tên/avatar được website ghép thêm
--     từ profiles ở #1.
-- =====================================================================

-- =====================================================================
-- 1) SCHEMA CÁC BẢNG CHAT
-- =====================================================================

-- ---------- messages ----------
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text,
  image_url text,
  reply_to uuid,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  is_recalled boolean NOT NULL DEFAULT false,
  recalled_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_recalled boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS recalled_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- An toàn khi bảng messages đã tồn tại từ trước: KHÔNG thêm PRIMARY KEY trực tiếp
-- (tránh lỗi 42P16 "multiple primary keys"), chỉ thêm khi bảng chưa có PK.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.messages SET id = gen_random_uuid() WHERE id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.messages'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.messages ADD PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_pair_idx ON public.messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_receiver_idx ON public.messages (receiver_id, is_read);
CREATE INDEX IF NOT EXISTS messages_receiver_created_idx ON public.messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages (conversation_id, created_at DESC);

-- ---------- conversations ----------
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_a integer NOT NULL DEFAULT 0,
  unread_b integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b)
);
-- Đảm bảo các cột tồn tại kể cả khi bảng đã tạo từ lần chạy cũ (CREATE TABLE IF NOT EXISTS bỏ qua).
-- KHÔNG dùng "ADD COLUMN ... PRIMARY KEY" trực tiếp (lỗi 42P16 nếu bảng đã có PK).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.conversations SET id = gen_random_uuid() WHERE id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.conversations'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.conversations ADD PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS user_a uuid;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS user_b uuid;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message text;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz DEFAULT now();
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_sender_id uuid;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS unread_a integer NOT NULL DEFAULT 0;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS unread_b integer NOT NULL DEFAULT 0;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_a_user_b_key ON public.conversations (user_a, user_b);
CREATE INDEX IF NOT EXISTS conversations_user_a_idx ON public.conversations (user_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_user_b_idx ON public.conversations (user_b, last_message_at DESC);

-- ---------- chat_partners ----------
CREATE TABLE IF NOT EXISTS public.chat_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id)
);
-- KHÔNG dùng "ADD COLUMN ... PRIMARY KEY" trực tiếp (lỗi 42P16 nếu bảng đã có PK).
ALTER TABLE public.chat_partners ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.chat_partners SET id = gen_random_uuid() WHERE id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.chat_partners'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.chat_partners ADD PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.chat_partners ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.chat_partners ADD COLUMN IF NOT EXISTS partner_id uuid;
ALTER TABLE public.chat_partners ADD COLUMN IF NOT EXISTS last_message_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.chat_partners ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS chat_partners_user_id_partner_id_key ON public.chat_partners (user_id, partner_id);
CREATE INDEX IF NOT EXISTS chat_partners_user_idx ON public.chat_partners (user_id, last_message_at DESC);

-- ---------- message_reactions ----------
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
-- KHÔNG dùng "ADD COLUMN ... PRIMARY KEY" trực tiếp (lỗi 42P16 nếu bảng đã có PK).
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.message_reactions SET id = gen_random_uuid() WHERE id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.message_reactions'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.message_reactions ADD PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS message_id uuid;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS emoji text;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_message_id_user_id_key ON public.message_reactions (message_id, user_id);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON public.message_reactions (message_id);

-- ---------- conversation_clears ----------
CREATE TABLE IF NOT EXISTS public.conversation_clears (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id)
);
-- KHÔNG dùng "ADD COLUMN ... PRIMARY KEY" trực tiếp (lỗi 42P16 nếu bảng đã có PK).
ALTER TABLE public.conversation_clears ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.conversation_clears SET id = gen_random_uuid() WHERE id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.conversation_clears'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.conversation_clears ADD PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.conversation_clears ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.conversation_clears ADD COLUMN IF NOT EXISTS partner_id uuid;
ALTER TABLE public.conversation_clears ADD COLUMN IF NOT EXISTS cleared_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS conversation_clears_user_id_partner_id_key ON public.conversation_clears (user_id, partner_id);
CREATE INDEX IF NOT EXISTS conversation_clears_user_idx ON public.conversation_clears (user_id);

-- =====================================================================
-- 2) GRANTS (Data API không tự cấp quyền trên schema public)
--    `anon` là cầu nối tạm thời vì session đang nằm ở Supabase #1.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages','conversations','chat_partners','message_reactions','conversation_clears'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- =====================================================================
-- 3) RLS + POLICY BRIDGE
-- =====================================================================
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_partners        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_clears  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages','conversations','chat_partners','message_reactions','conversation_clears'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_anon_bridge', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t || '_anon_bridge', t
    );
  END LOOP;
END $$;

-- =====================================================================
-- 4) REALTIME (gửi/nhận tin nhắn tức thời vẫn hoạt động sau khi cutover)
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages','conversations','chat_partners','message_reactions','conversation_clears'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- =====================================================================
-- 5) RPC QUẢN TRỊ INBOX / CHAT ADMIN (bản Supabase #3)
--    Không join profiles: website ghép tên/avatar từ Supabase #1.
-- =====================================================================

-- 5.1 Hộp thư của các tài khoản Clone: unread + thời điểm tin mới nhất.
DROP FUNCTION IF EXISTS public.admin_internal_inbox_by_account(uuid[]);
CREATE OR REPLACE FUNCTION public.admin_internal_inbox_by_account(p_accounts uuid[])
RETURNS TABLE (account_id uuid, unread bigint, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         count(m.id) FILTER (WHERE coalesce(m.is_read, false) = false)::bigint,
         max(m.created_at)
    FROM unnest(coalesce(p_accounts, ARRAY[]::uuid[])) AS a(id)
    LEFT JOIN public.messages m ON m.receiver_id = a.id
   GROUP BY a.id;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_inbox_by_account(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_inbox_by_account(uuid[]) TO anon, authenticated;

-- 5.2 Danh sách hội thoại của 1 tài khoản Clone.
DROP FUNCTION IF EXISTS public.admin_internal_threads(uuid);
CREATE OR REPLACE FUNCTION public.admin_internal_threads(p_account uuid)
RETURNS TABLE (peer_id uuid, last_content text, last_at timestamptz, unread bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH conv AS (
    SELECT CASE WHEN m.sender_id = p_account THEN m.receiver_id ELSE m.sender_id END AS pid,
           m.content, m.created_at, m.receiver_id, m.is_read
      FROM public.messages m
     WHERE m.sender_id = p_account OR m.receiver_id = p_account
  ), agg AS (
    SELECT c.pid,
           max(c.created_at) AS last_at,
           count(*) FILTER (
             WHERE c.receiver_id = p_account AND coalesce(c.is_read, false) = false
           ) AS unread
      FROM conv c
     GROUP BY c.pid
  )
  SELECT a.pid,
         (SELECT c2.content FROM conv c2 WHERE c2.pid = a.pid ORDER BY c2.created_at DESC LIMIT 1),
         a.last_at,
         a.unread
    FROM agg a
   ORDER BY a.last_at DESC NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_threads(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_threads(uuid) TO anon, authenticated;

-- 5.3 Tin nhắn của một hội thoại (đồng thời đánh dấu đã đọc).
DROP FUNCTION IF EXISTS public.admin_internal_thread_messages(uuid, uuid, int);
CREATE OR REPLACE FUNCTION public.admin_internal_thread_messages(
  p_account uuid, p_peer uuid, p_limit int DEFAULT 200
) RETURNS TABLE (
  id uuid, sender_id uuid, receiver_id uuid, content text, image_url text, created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.messages m
     SET is_read = true
   WHERE m.receiver_id = p_account
     AND m.sender_id = p_peer
     AND coalesce(m.is_read, false) = false;

  RETURN QUERY
  SELECT m.id, m.sender_id, m.receiver_id, m.content, m.image_url, m.created_at
    FROM public.messages m
   WHERE (m.sender_id = p_account AND m.receiver_id = p_peer)
      OR (m.sender_id = p_peer AND m.receiver_id = p_account)
   ORDER BY m.created_at ASC
   LIMIT greatest(coalesce(p_limit, 200), 1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_thread_messages(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_thread_messages(uuid, uuid, int) TO anon, authenticated;

-- 5.4 Gửi tin nhắn với tư cách Clone (messages đã nằm ở #3 nên RPC phải ở #3).
DROP FUNCTION IF EXISTS public.admin_internal_send_message(uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION public.admin_internal_send_message(
  p_account uuid, p_peer uuid, p_content text, p_image_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_img text := nullif(trim(coalesce(p_image_url, '')), '');
BEGIN
  IF p_account IS NULL OR p_peer IS NULL OR p_account = p_peer THEN
    RAISE EXCEPTION 'Tài khoản không hợp lệ' USING ERRCODE = 'P0002';
  END IF;
  IF nullif(trim(coalesce(p_content, '')), '') IS NULL AND v_img IS NULL THEN
    RAISE EXCEPTION 'Nội dung trống' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.messages (sender_id, receiver_id, content, image_url, is_read)
  VALUES (p_account, p_peer, trim(coalesce(p_content, '')), v_img, false)
  RETURNING id INTO v_id;

  INSERT INTO public.chat_partners (user_id, partner_id, last_message_at)
  VALUES (p_account, p_peer, now()), (p_peer, p_account, now())
  ON CONFLICT (user_id, partner_id) DO UPDATE SET last_message_at = now();

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_send_message(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_send_message(uuid, uuid, text, text) TO anon, authenticated;

-- 5.5 Đánh dấu đã đọc toàn bộ tin nhắn của danh sách Clone (giữ nguyên nội dung).
DROP FUNCTION IF EXISTS public.admin_internal_mark_all_read(uuid[]);
CREATE OR REPLACE FUNCTION public.admin_internal_mark_all_read(p_accounts uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.messages m
     SET is_read = true, read_at = coalesce(m.read_at, now())
   WHERE coalesce(m.is_read, false) = false
     AND m.receiver_id = ANY (coalesce(p_accounts, ARRAY[]::uuid[]));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_mark_all_read(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_mark_all_read(uuid[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
