-- =====================================================================
-- MESSAGE SYSTEM V2 — tin nhắn tự hủy sau 72 giờ (3 ngày)
-- BẢN VIẾT LẠI (2026-08-13): chạy được trên Supabase hiện tại, KHÔNG cần
-- superuser. Đã loại bỏ hoàn toàn:
--   • CREATE EXTENSION / pg_cron / cron.schedule
--   • REVOKE (nguyên nhân lỗi 2BP01: dependent privileges exist)
-- Chỉ còn: CREATE TABLE, CREATE FUNCTION, CREATE TRIGGER, RPC
-- admin_reset_chat_data và các câu DELETE dữ liệu chat.
-- Chỉ đụng messages / notifications / message_reactions / chat_partners.
-- KHÔNG xoá tài khoản, hồ sơ, bài viết, bình luận, like, follow, xu, VIP.
-- Chạy lại nhiều lần đều an toàn (idempotent).
--
-- Tự động reset: dùng cơ chế sẵn có của project (Scheduled Job gọi HTTP
-- endpoint /api/public/purge-chat-cron) — xem cuối file.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CREATE TABLE — danh sách người từng chat (giữ lại sau khi xoá tin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_partners (
  user_id    uuid NOT NULL,
  partner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_id)
);

-- Quyền Data API cho bảng MỚI này (bắt buộc để PostgREST đọc/ghi được).
-- Đây là quyền trên bảng của chính project, không phải quyền hệ thống,
-- và không có REVOKE nào nên sẽ không gặp lỗi 2BP01.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_partners TO authenticated;
GRANT ALL ON public.chat_partners TO service_role;

ALTER TABLE public.chat_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own chat partners select" ON public.chat_partners;
CREATE POLICY "own chat partners select" ON public.chat_partners
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own chat partners insert" ON public.chat_partners;
CREATE POLICY "own chat partners insert" ON public.chat_partners
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own chat partners update" ON public.chat_partners;
CREATE POLICY "own chat partners update" ON public.chat_partners
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own chat partners delete" ON public.chat_partners;
CREATE POLICY "own chat partners delete" ON public.chat_partners
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Index cho dọn dẹp theo thời gian
CREATE INDEX IF NOT EXISTS messages_created_at_idx
  ON public.messages (created_at);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx2
  ON public.notifications (created_at);

-- ---------------------------------------------------------------------
-- 2) CREATE FUNCTION + CREATE TRIGGER — tự ghi nhớ cặp hội thoại
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remember_chat_partners()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS NOT NULL AND NEW.receiver_id IS NOT NULL
     AND NEW.sender_id <> NEW.receiver_id THEN
    INSERT INTO public.chat_partners (user_id, partner_id)
    VALUES (NEW.sender_id, NEW.receiver_id), (NEW.receiver_id, NEW.sender_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remember_chat_partners ON public.messages;
CREATE TRIGGER trg_remember_chat_partners
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.remember_chat_partners();

-- Nạp lịch sử hiện có (an toàn khi chạy lại).
INSERT INTO public.chat_partners (user_id, partner_id)
SELECT DISTINCT m.sender_id, m.receiver_id
  FROM public.messages m
 WHERE m.sender_id IS NOT NULL
   AND m.receiver_id IS NOT NULL
   AND m.sender_id <> m.receiver_id
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_partners (user_id, partner_id)
SELECT DISTINCT m.receiver_id, m.sender_id
  FROM public.messages m
 WHERE m.sender_id IS NOT NULL
   AND m.receiver_id IS NOT NULL
   AND m.sender_id <> m.receiver_id
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3) CREATE FUNCTION — dọn dữ liệu chat quá 72 giờ (DELETE dữ liệu chat)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_chat_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff  timestamptz := now() - interval '72 hours';
  deleted integer := 0;
  n       integer;
BEGIN
  IF to_regclass('public.message_reactions') IS NOT NULL THEN
    DELETE FROM public.message_reactions r
     WHERE r.message_id IN (
       SELECT id FROM public.messages WHERE created_at < cutoff
     );
  END IF;

  DELETE FROM public.messages WHERE created_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; deleted := deleted + n;

  DELETE FROM public.notifications WHERE created_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; deleted := deleted + n;

  RETURN deleted;
END;
$$;

-- anon: để Scheduled Job / endpoint /api/public/purge-chat-cron gọi được.
GRANT EXECUTE ON FUNCTION public.purge_expired_chat_data() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) RPC admin_reset_chat_data — admin bấm "Reset dữ liệu" → xoá ngay
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reset_chat_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted integer := 0;
  n       integer;
  is_admin boolean := false;
BEGIN
  -- Chỉ super admin. Dùng hàm sẵn có nếu tồn tại, nếu không thì đọc user_roles.
  IF to_regprocedure('public._is_super_admin()') IS NOT NULL THEN
    EXECUTE 'SELECT public._is_super_admin()' INTO is_admin;
  ELSIF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = auth.uid()
           AND role::text IN ('admin', 'super_admin')
      )
    $q$ INTO is_admin;
  END IF;

  IF NOT COALESCE(is_admin, false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF to_regclass('public.message_reactions') IS NOT NULL THEN
    DELETE FROM public.message_reactions;
  END IF;

  DELETE FROM public.messages;
  GET DIAGNOSTICS n = ROW_COUNT; deleted := deleted + n;

  DELETE FROM public.notifications;
  GET DIAGNOSTICS n = ROW_COUNT; deleted := deleted + n;

  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_chat_data() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) Dọn ngay 1 lần các dữ liệu chat đã quá 72 giờ
-- ---------------------------------------------------------------------
DELETE FROM public.message_reactions r
 WHERE r.message_id IN (
   SELECT id FROM public.messages WHERE created_at < now() - interval '72 hours'
 );

DELETE FROM public.messages
 WHERE created_at < now() - interval '72 hours';

DELETE FROM public.notifications
 WHERE created_at < now() - interval '72 hours';

-- ---------------------------------------------------------------------
-- 6) TỰ ĐỘNG RESET — KHÔNG dùng pg_cron
-- ---------------------------------------------------------------------
-- Project đã có sẵn endpoint HTTP công khai (bypass auth) để chạy job:
--     POST https://<domain>/api/public/purge-chat-cron
--     Header: x-cron-secret: <CRON_SECRET>
-- Cấu hình một Scheduled Job (Supabase Dashboard → Integrations → Cron,
-- hoặc bất kỳ scheduler bên ngoài) gọi endpoint này mỗi giờ:
--     5 * * * *
-- Endpoint sẽ gọi public.purge_expired_chat_data() ở trên.

NOTIFY pgrst, 'reload schema';
