-- =============================================================
-- SECURITY HARDENING (FIXED) — Project zbuwddjcqdlyijcunwgd
-- Schema-aware. Idempotent. KHÔNG xoá / sửa dữ liệu hiện có.
--
-- Schema thật:
--   profiles(id, candy, ...)                         -- balance = candy
--   gem_transactions(id, from_id, to_id, amount,
--                    note, action_type, post_id,
--                    status, metadata, created_at)
--   gem_transfer_cooldown(user_id, last_transfer_at)
--   post_gifts(post_id, sender_id, amount)
--   messages(sender_id, receiver_id, ...)
-- =============================================================

-- 1) ENABLE RLS (idempotent) trên các bảng nhạy cảm thực có
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles','posts','comments','messages','post_gifts',
    'gem_transactions','gem_transfer_cooldown',
    'notifications','followers','activity_logs','user_settings'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END$$;

-- 2) ROLES — bảng riêng, tránh privilege escalation
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
-- Không tạo policy INSERT/UPDATE/DELETE → chỉ service_role mới gán role được.

-- 3) AUDIT LOG (mới, không đụng bảng cũ)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx   ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs(action,  created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL    ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS "audit admins read" ON public.audit_logs;
CREATE POLICY "audit admins read" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.log_audit(_action text, _target_type text, _target_id text, _metadata jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs(user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _action, _target_type, _target_id, COALESCE(_metadata,'{}'::jsonb));
END$$;

-- 4) GEM TRANSACTIONS — chỉ thêm INDEX/POLICY khớp đúng cột thật (from_id/to_id)
CREATE INDEX IF NOT EXISTS gem_tx_from_idx ON public.gem_transactions(from_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gem_tx_to_idx   ON public.gem_transactions(to_id,   created_at DESC);

GRANT SELECT ON public.gem_transactions TO authenticated;
GRANT ALL    ON public.gem_transactions TO service_role;

DROP POLICY IF EXISTS "gem_tx own read"  ON public.gem_transactions;
DROP POLICY IF EXISTS "see my gem tx"    ON public.gem_transactions;
CREATE POLICY "gem_tx own read" ON public.gem_transactions
  FOR SELECT TO authenticated
  USING (from_id = auth.uid() OR to_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
-- KHÔNG mở INSERT/UPDATE/DELETE cho client — toàn bộ ghi đi qua RPC SECURITY DEFINER.

-- 5) PROFILES — chặn user tự sửa cột nhạy cảm (candy / is_admin / is_vip / role)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='profiles') THEN

    CREATE OR REPLACE FUNCTION public.profiles_block_privileged_columns()
    RETURNS trigger LANGUAGE plpgsql AS $T$
    BEGIN
      IF auth.role() <> 'service_role'
         AND NOT public.has_role(auth.uid(),'admin') THEN

        -- candy = số dư Gem thật trong DB này
        IF to_jsonb(NEW) ? 'candy'
           AND (to_jsonb(NEW)->>'candy') IS DISTINCT FROM (to_jsonb(OLD)->>'candy') THEN
          RAISE EXCEPTION 'candy can only be changed via transfer_gem_secure()';
        END IF;

        IF to_jsonb(NEW) ? 'is_admin'
           AND (to_jsonb(NEW)->>'is_admin') IS DISTINCT FROM (to_jsonb(OLD)->>'is_admin') THEN
          RAISE EXCEPTION 'is_admin is read-only';
        END IF;

        IF to_jsonb(NEW) ? 'is_vip'
           AND (to_jsonb(NEW)->>'is_vip') IS DISTINCT FROM (to_jsonb(OLD)->>'is_vip') THEN
          RAISE EXCEPTION 'is_vip is read-only';
        END IF;

        IF to_jsonb(NEW) ? 'role'
           AND (to_jsonb(NEW)->>'role') IS DISTINCT FROM (to_jsonb(OLD)->>'role') THEN
          RAISE EXCEPTION 'role is read-only';
        END IF;
      END IF;
      RETURN NEW;
    END$T$;

    DROP TRIGGER IF EXISTS profiles_block_priv ON public.profiles;
    CREATE TRIGGER profiles_block_priv
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.profiles_block_privileged_columns();
  END IF;
END$$;

-- 6) POST_GIFTS — read policy khớp cột thật (sender_id) — KHÔNG mở write cho client
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='post_gifts') THEN
    EXECUTE 'GRANT SELECT ON public.post_gifts TO authenticated';
    EXECUTE 'GRANT ALL    ON public.post_gifts TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS "post_gifts read" ON public.post_gifts';
    EXECUTE 'CREATE POLICY "post_gifts read" ON public.post_gifts
               FOR SELECT TO authenticated USING (true)';
  END IF;
END$$;

-- 7) MESSAGES — chỉ chủ cuộc trò chuyện mới đọc/ghi
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='messages') THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.messages TO authenticated';
    EXECUTE 'GRANT ALL ON public.messages TO service_role';

    EXECUTE 'DROP POLICY IF EXISTS "messages participants read" ON public.messages';
    EXECUTE 'CREATE POLICY "messages participants read" ON public.messages
               FOR SELECT TO authenticated
               USING (sender_id = auth.uid() OR receiver_id = auth.uid())';

    EXECUTE 'DROP POLICY IF EXISTS "messages sender insert" ON public.messages';
    EXECUTE 'CREATE POLICY "messages sender insert" ON public.messages
               FOR INSERT TO authenticated
               WITH CHECK (sender_id = auth.uid())';
  END IF;
END$$;
