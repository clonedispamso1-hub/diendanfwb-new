-- =====================================================================
-- 🧱 INIT_CLEAN_SB1.sql — KHỞI TẠO SUPABASE 1 MỚI TINH (NHÓM 1: LÕI HỆ THỐNG)
--
-- Mục đích: chuyển sang Project Supabase 1 MỚI để reset Egress về 0.
-- File này CHỈ chứa tài nguyên Lõi (core). TUYỆT ĐỐI KHÔNG chứa:
--   ❌ Posts / Comments / Messages / Games / Autopilot rác cũ
--   (những phần đó đang nằm ở Supabase #3 theo Database Router).
--
-- CÁCH DÙNG:
--   1. Tạo project Supabase mới (region Singapore cho nhanh).
--   2. Mở SQL Editor → dán TOÀN BỘ file này → Run (idempotent, chạy lại được).
--   3. Tạo tài khoản Bang Chủ đầu tiên (đăng ký qua app hoặc Dashboard → Auth),
--      rồi chạy đoạn PHONG QUYỀN ở cuối file (bỏ comment + thay <UID_CUA_BAN>).
--   4. Cập nhật 2 biến môi trường trong file .env của app:
--
--         VITE_SUPABASE_URL_1=https://<PROJECT_REF_MOI>.supabase.co
--         VITE_SUPABASE_ANON_KEY_1=<anon/public key của project mới>
--
--      (Lấy ở: Supabase Dashboard → Project Settings → API Keys.)
--      ⚠️ Nếu app đang đọc tên biến cũ (VITE_SUPABASE_URL /
--      VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY) trong
--      src/lib/db/config.ts, hãy trỏ fallback PRIMARY.url/anonKey sang
--      2 biến _1 ở trên, hoặc đặt cả cặp cũ lẫn mới cùng giá trị project mới.
-- =====================================================================

BEGIN;

-- =====================================================================
-- PHẦN 0 — EXTENSIONS & ENUMS
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid, crypt, digest
-- Supabase mặc định đặt pgcrypto trong schema "extensions".

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bổ sung super_admin vào enum nếu enum cũ chưa có.
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bangchu_role AS ENUM ('admin_1','admin_2','agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bangchu_status AS ENUM ('pending','approved','rejected','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- PHẦN 1 — BẢNG DỮ LIỆU LÕI
-- =====================================================================

-- ---------- 1.1 profiles (bảng trung tâm, mirror DB cũ) ---------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_id        text,
  username         text UNIQUE,
  display_name     text,
  full_name        text,
  avatar           text,
  avatar_url       text,
  bio              text,
  gender           text,
  age              int,
  province         text,
  location         text,
  intent           text,

  -- ví xu / gem
  gem_balance      bigint NOT NULL DEFAULT 0,
  candy_balance    bigint NOT NULL DEFAULT 0,

  -- cờ hệ thống
  is_admin         boolean NOT NULL DEFAULT false,
  role             text NOT NULL DEFAULT 'user',
  vip_level        int  NOT NULL DEFAULT 0,
  trust_score      int  NOT NULL DEFAULT 0,
  followers_count  bigint NOT NULL DEFAULT 0,
  is_online        boolean NOT NULL DEFAULT false,

  -- cờ clone / nick ảo
  is_virtual       boolean NOT NULL DEFAULT false,
  is_clone         boolean NOT NULL DEFAULT false,
  is_seed_account  boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active',

  -- khoá / ban
  is_banned        boolean NOT NULL DEFAULT false,
  banned_until     timestamptz,
  ban_reason       text,
  ban_level        smallint NOT NULL DEFAULT 0,
  banned_at        timestamptz,
  banned_by        uuid,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_username_idx  ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS profiles_clone_idx     ON public.profiles (is_clone) WHERE is_clone;
CREATE INDEX IF NOT EXISTS profiles_banned_idx    ON public.profiles (is_banned) WHERE is_banned;

-- public_id: 6 ký tự, không trùng, tự sinh.
CREATE OR REPLACE FUNCTION public.gen_profile_public_id()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  alphabet CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text; i integer;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE public_id = candidate);
  END LOOP;
  RETURN candidate;
END; $$;

CREATE OR REPLACE FUNCTION public.set_profile_public_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.public_id IS NULL OR btrim(NEW.public_id) = '' THEN
    NEW.public_id := public.gen_profile_public_id();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_profile_public_id ON public.profiles;
CREATE TRIGGER trg_set_profile_public_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_public_id();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_id_key ON public.profiles (public_id);

-- ---------- 1.2 user_roles (phân quyền — KHÔNG lưu role trên profiles) --
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- ---------- 1.3 bangchu (Bang Chủ / Đại lý) ----------------------------
CREATE TABLE IF NOT EXISTS public.bangchu (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- alias tương thích code cũ
  username     text NOT NULL UNIQUE,
  role         public.bangchu_role   NOT NULL DEFAULT 'agent',
  status       public.bangchu_status NOT NULL DEFAULT 'pending',
  is_active    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  approved_by  uuid REFERENCES auth.users(id),
  approved_at  timestamptz,
  CONSTRAINT bangchu_username_format CHECK (username ~ '^[A-Za-z0-9_]{6,30}$')
);
CREATE INDEX IF NOT EXISTS bangchu_status_idx ON public.bangchu(status);
CREATE INDEX IF NOT EXISTS bangchu_role_idx   ON public.bangchu(role);

-- ---------- 1.4 admin_permissions (quyền module admin) -----------------
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission  text NOT NULL,           -- super_admin/moderation_admin/finance_admin/...
  granted_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

-- ---------- 1.5 admin_site_settings (cấu hình site: bảo trì, popup...) -
CREATE TABLE IF NOT EXISTS public.admin_site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.admin_site_settings(key, value)
VALUES ('maintenance', jsonb_build_object(
  'enabled', false,
  'title', 'Website đang bảo trì',
  'description', 'Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.',
  'logo_url', '', 'bg_url', '', 'eta', '', 'progress', 0, 'contact_url', ''
))
ON CONFLICT (key) DO NOTHING;

-- ---------- 1.6 admin_config (key/value nội bộ: capadmin_hash...) ------
CREATE TABLE IF NOT EXISTS public.admin_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- ---------- 1.7 gem_transactions (sổ cái ví Gem) ------------------------
CREATE TABLE IF NOT EXISTS public.gem_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id     text UNIQUE,        -- khoá idempotency
  sender_id             uuid REFERENCES auth.users(id),
  receiver_id           uuid REFERENCES auth.users(id),
  amount                bigint NOT NULL,
  kind                  text NOT NULL,      -- 'gift','tip','admin_grant','admin_internal_gift',...
  sender_balance_after   bigint,
  receiver_balance_after bigint,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gem_tx_sender_idx   ON public.gem_transactions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gem_tx_receiver_idx ON public.gem_transactions(receiver_id, created_at DESC);

-- ---------- 1.8 coin_transactions (sổ cái ví Xu) ------------------------
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount            bigint NOT NULL,
  transaction_type  text NOT NULL,
  reference_post_id uuid,                   -- chỉ là tham chiếu mềm (posts nằm ở SB3)
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coin_tx_user_idx ON public.coin_transactions(user_id, created_at DESC);

-- ---------- 1.9 blocked_ips --------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         text NOT NULL,
  reason     text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_ips_ip_uidx ON public.blocked_ips(ip);

-- ---------- 1.10 blocked_devices ---------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint     text,
  ip              text,
  reason          text,
  blocked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blocked_devices_fp_idx   ON public.blocked_devices (fingerprint);
CREATE INDEX IF NOT EXISTS blocked_devices_ip_idx   ON public.blocked_devices (ip);
CREATE INDEX IF NOT EXISTS blocked_devices_user_idx ON public.blocked_devices (blocked_user_id);

-- ---------- 1.11 blocked_keywords / banned_keywords ---------------------
CREATE TABLE IF NOT EXISTS public.blocked_keywords (
  id         bigserial PRIMARY KEY,
  keyword    text NOT NULL UNIQUE,
  reason     text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banned_keywords (
  id         bigserial PRIMARY KEY,
  keyword    text NOT NULL UNIQUE,
  normalized text NOT NULL,
  severity   text NOT NULL DEFAULT 'medium',
  penalty    int  NOT NULL DEFAULT 15,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_banned_keywords_normalized ON public.banned_keywords (normalized);

-- ---------- 1.12 forced_logouts (ép đăng xuất realtime) ----------------
CREATE TABLE IF NOT EXISTS public.forced_logouts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forced_logouts_user_idx ON public.forced_logouts(user_id, created_at DESC);
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.forced_logouts;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
ALTER TABLE public.forced_logouts REPLICA IDENTITY FULL;

-- ---------- 1.13 bot_accounts / bot_settings / bot_roles ----------------
CREATE TABLE IF NOT EXISTS public.bot_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username         text UNIQUE,
  display_name     text,
  avatar           text,
  bot_type         text NOT NULL DEFAULT 'moderation',
  active           boolean NOT NULL DEFAULT false,
  permissions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  automation_level int  NOT NULL DEFAULT 0,
  risk_level       text NOT NULL DEFAULT 'low',
  last_active      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bot_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.bot_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- 1.14 nicktuongtac (nick ảo thuần content, KHÔNG dính auth) --
CREATE TABLE IF NOT EXISTS public.nicktuongtac (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username        text UNIQUE,
  display_name    text,
  full_name       text,
  avatar          text,
  avatar_url      text,
  bio             text,
  province        text,
  location        text,
  followers_count bigint NOT NULL DEFAULT 0,
  vip_level       int  NOT NULL DEFAULT 0,
  is_online       boolean NOT NULL DEFAULT false,
  trust_score     int  NOT NULL DEFAULT 0,
  intent          text,
  age             int,
  gender          text,
  is_active       boolean NOT NULL DEFAULT true,
  is_virtual      boolean NOT NULL DEFAULT true,
  is_clone        boolean NOT NULL DEFAULT true,
  is_seed_account boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nicktuongtac_province_idx ON public.nicktuongtac (province);

-- ---------- 1.15 internal_account_credentials (mật khẩu nick nội bộ) ---
CREATE TABLE IF NOT EXISTS public.internal_account_credentials (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  password   text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- PHẦN 2 — TRIGGER ĐĂNG KÝ (tự tạo profile + ví xu)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username  text;
  v_full_name text;
  v_avatar    text;
BEGIN
  v_username := coalesce(
    NEW.raw_user_meta_data->>'username',
    split_part(coalesce(NEW.email, NEW.id::text), '@', 1)
  );
  v_full_name := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    v_username
  );
  v_avatar := NEW.raw_user_meta_data->>'avatar_url';

  BEGIN
    INSERT INTO public.profiles (id, username, full_name, display_name, avatar, avatar_url, gem_balance, candy_balance)
    VALUES (NEW.id, v_username, v_full_name, v_full_name, v_avatar, v_avatar, 0, 0)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.profiles (id, username, full_name, display_name, avatar, avatar_url, gem_balance, candy_balance)
      VALUES (
        NEW.id,
        v_username || '_' || substr(md5(random()::text), 1, 6),
        v_full_name, v_full_name, v_avatar, v_avatar, 0, 0
      )
      ON CONFLICT (id) DO NOTHING;
    WHEN others THEN
      -- Không bao giờ chặn signup vì lỗi profile.
      RAISE WARNING 'handle_new_user failed for %: % / %', NEW.id, sqlstate, sqlerrm;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- PHẦN 3 — RPC PHÂN QUYỀN & ADMIN
-- =====================================================================

-- _is_current_admin: admin hợp lệ (mọi cấp).
CREATE OR REPLACE FUNCTION public._is_current_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false)
      OR EXISTS (SELECT 1 FROM public.user_roles
                  WHERE user_id = auth.uid() AND role::text IN ('admin','super_admin','moderator'));
$$;

-- _is_super_admin: chỉ super_admin / admin_1 (Bang Chủ approved).
CREATE OR REPLACE FUNCTION public._is_super_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _uid AND role::text IN ('admin','super_admin')
  ) INTO ok;
  IF ok THEN RETURN true; END IF;

  BEGIN
    SELECT (COALESCE(is_admin,false) = true OR role IN ('admin','super_admin','admin_1'))
      INTO ok FROM public.profiles WHERE id = _uid;
  EXCEPTION WHEN undefined_column THEN ok := false; END;
  IF ok THEN RETURN true; END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.bangchu
       WHERE auth_user_id = _uid
         AND role = 'admin_1'
         AND status = 'approved'
         AND is_active = true
    ) INTO ok;
  EXCEPTION WHEN undefined_table OR undefined_column THEN ok := false; END;

  RETURN COALESCE(ok, false);
END;
$$;

-- check_admin_status: app gọi để biết quyền của user hiện tại.
CREATE OR REPLACE FUNCTION public.check_admin_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_super boolean := false;
  v_perms text[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'is_admin', false, 'is_super_admin', false, 'permissions', '[]'::jsonb);
  END IF;
  v_is_admin := public._is_current_admin();
  v_is_super := public._is_super_admin(v_uid);
  SELECT COALESCE(array_agg(permission), '{}')
    INTO v_perms
    FROM public.admin_permissions WHERE user_id = v_uid;
  RETURN jsonb_build_object(
    'ok', true,
    'is_admin', v_is_admin,
    'is_super_admin', v_is_super,
    'permissions', to_jsonb(v_perms)
  );
END;
$$;

-- =====================================================================
-- PHẦN 4 — RPC VÍ XU / GEM
-- =====================================================================

-- admin_adjust_gem_balance: cộng/trừ Gem cho 1 user.
CREATE OR REPLACE FUNCTION public.admin_adjust_gem_balance(
  p_target_user_id uuid,
  p_amount         bigint,
  p_reason         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old bigint; v_new bigint;
  v_max bigint := 9223372036854775000;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;
  IF NOT public._is_current_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bạn không có quyền admin');
  END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_old
    FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF v_old IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', 'Không tìm thấy user');
  END IF;

  v_new := v_old + p_amount;
  IF v_new < 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE',
      'message', 'Số dư không đủ để trừ', 'old', v_old, 'requested', p_amount);
  END IF;
  IF v_new > v_max THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OVERFLOW', 'message', 'Vượt giới hạn Gem');
  END IF;

  UPDATE public.profiles SET gem_balance = v_new, updated_at = now()
   WHERE id = p_target_user_id;

  INSERT INTO public.gem_transactions(sender_id, receiver_id, amount, kind, receiver_balance_after)
  VALUES (v_caller, p_target_user_id, abs(p_amount),
          CASE WHEN p_amount > 0 THEN 'admin_grant' ELSE 'admin_deduct' END,
          v_new);

  RETURN jsonb_build_object('ok', true, 'old', v_old, 'new', v_new, 'amount', p_amount);
END;
$$;

-- admin_buff_gems: buff Gem hàng loạt (cho clone / nhiều user).
CREATE OR REPLACE FUNCTION public.admin_buff_gems(
  p_user_ids uuid[],
  p_amount   bigint,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_uid uuid; v_ok int := 0; v_skip int := 0; v_new bigint;
BEGIN
  IF v_caller IS NULL OR NOT public._is_current_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Admin.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem phải > 0');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);

  FOREACH v_uid IN ARRAY COALESCE(p_user_ids, '{}') LOOP
    UPDATE public.profiles
       SET gem_balance = COALESCE(gem_balance, 0) + p_amount, updated_at = now()
     WHERE id = v_uid
    RETURNING gem_balance INTO v_new;
    IF FOUND THEN
      v_ok := v_ok + 1;
      INSERT INTO public.gem_transactions(sender_id, receiver_id, amount, kind, receiver_balance_after)
      VALUES (v_caller, v_uid, p_amount, 'admin_buff', v_new);
    ELSE
      v_skip := v_skip + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'buffed', v_ok, 'skipped', v_skip, 'amount', p_amount);
END;
$$;

-- admin_internal_gift_post (BẢN MỚI SẠCH):
--   CHỈ trừ xu khỏi ví clone + ghi lịch sử ví (gem_transactions).
--   HOÀN TOÀN KHÔNG đụng bảng notifications, posts, post_gifts.
--   (Bài viết & thông báo nằm ở Supabase #3 — phần đó app xử lý riêng.)
CREATE OR REPLACE FUNCTION public.admin_internal_gift_post(
  p_account  uuid,
  p_post_id  uuid,
  p_gift_key text,
  p_amount   bigint,
  p_idem     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin   uuid := auth.uid();
  v_bal     bigint;
  v_new_bal bigint;
  v_idem    text := NULLIF(p_idem, '');
  v_dup     uuid;
BEGIN
  IF v_admin IS NULL OR NOT public._is_current_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Admin.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số xu không hợp lệ.');
  END IF;

  -- Idempotent: cùng idem key → trả kết quả cũ, không trừ trùng.
  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_dup FROM public.gem_transactions WHERE client_request_id = v_idem;
    IF v_dup IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'amount', p_amount, 'gift_key', p_gift_key);
    END IF;
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = p_account FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không thấy ví clone.');
  END IF;
  IF v_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Clone không đủ xu.');
  END IF;

  UPDATE public.profiles SET gem_balance = v_bal - p_amount, updated_at = now()
   WHERE id = p_account RETURNING gem_balance INTO v_new_bal;

  INSERT INTO public.gem_transactions(
    client_request_id, sender_id, receiver_id, amount, kind, sender_balance_after
  ) VALUES (
    v_idem, p_account, NULL, p_amount,
    'admin_internal_gift:' || COALESCE(p_gift_key, 'unknown') || ':' || COALESCE(p_post_id::text, '-'),
    v_new_bal
  );

  RETURN jsonb_build_object('ok', true, 'amount', p_amount, 'gift_key', p_gift_key,
                            'balance_after', v_new_bal);
END;
$$;

-- =====================================================================
-- PHẦN 5 — RPC BẢO MẬT & CLONE
-- =====================================================================

-- admin_block_device: chặn fingerprint/IP của 1 user (dựa trên dữ liệu
-- thiết bị đã ghi nhận; nếu chưa có dữ liệu thiết bị, vẫn cho chặn thủ công
-- bằng p_manual_fingerprint / p_manual_ip).
CREATE OR REPLACE FUNCTION public.admin_block_device(
  p_user_id      uuid,
  p_block_ip     boolean DEFAULT false,
  p_block_device boolean DEFAULT false,
  p_reason       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  -- Bản sạch: ghi 1 dòng đánh dấu user bị chặn thiết bị/IP; app đọc bảng
  -- blocked_devices khi login/đăng ký để từ chối. Chi tiết fingerprint lấy
  -- từ device_registrations (bảng ở nhóm khác) nên ở đây chỉ lưu mốc user.
  IF NOT (p_block_ip OR p_block_device) THEN
    RETURN jsonb_build_object('ok', true, 'inserted', 0, 'note', 'nothing_to_block');
  END IF;
  INSERT INTO public.blocked_devices(fingerprint, ip, reason, blocked_user_id, created_by)
  VALUES (NULL, NULL, COALESCE(p_reason, 'admin_block_device'), p_user_id, auth.uid());
  RETURN jsonb_build_object('ok', true, 'inserted', 1);
END;
$$;

-- admin_block_user_ip: thêm IP vào danh sách chặn.
CREATE OR REPLACE FUNCTION public.admin_block_user_ip(
  p_ip     text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_ip IS NULL OR btrim(p_ip) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_IP', 'message', 'IP không hợp lệ');
  END IF;
  INSERT INTO public.blocked_ips(ip, reason, created_by)
  VALUES (btrim(p_ip), p_reason, auth.uid())
  ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason;
  RETURN jsonb_build_object('ok', true, 'ip', btrim(p_ip));
END;
$$;

-- admin_bulk_ban: khoá hàng loạt (kèm tuỳ chọn chặn IP/thiết bị).
CREATE OR REPLACE FUNCTION public.admin_bulk_ban(
  p_user_ids     uuid[],
  p_days         int     DEFAULT 0,
  p_block_ip     boolean DEFAULT false,
  p_block_device boolean DEFAULT false,
  p_reason       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_until timestamptz;
  v_uid uuid;
  v_count int := 0;
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  v_until := CASE WHEN p_days > 0 THEN now() + (p_days::text || ' days')::interval END;

  UPDATE public.profiles
     SET is_banned = true, banned_until = v_until,
         ban_reason = COALESCE(NULLIF(btrim(p_reason), ''), ban_reason),
         banned_at = now(), banned_by = auth.uid(),
         updated_at = now()
   WHERE id = ANY(p_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_block_ip OR p_block_device THEN
    FOREACH v_uid IN ARRAY p_user_ids LOOP
      PERFORM public.admin_block_device(v_uid, p_block_ip, p_block_device, p_reason);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;

-- admin_bulk_create_virtual_clones: tạo hàng loạt nick ảo trong profiles
-- mà KHÔNG bị trigger giới hạn thiết bị/IP chặn.
CREATE OR REPLACE FUNCTION public.admin_bulk_create_virtual_clones(
  p_rows jsonb
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row    jsonb;
  v_new_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '28000';
  END IF;
  IF NOT public._is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo nick ảo' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Tham số p_rows phải là JSON array' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);
  PERFORM set_config('app.bypass_device_limit', '1', true);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_new_id := gen_random_uuid();
    v_row := v_row
      || jsonb_build_object('id', v_new_id)
      || jsonb_build_object('is_virtual', true)
      || jsonb_build_object('is_clone', true)
      || jsonb_build_object('is_seed_account', true);

    RETURN QUERY
    INSERT INTO public.profiles
    SELECT * FROM jsonb_populate_record(NULL::public.profiles, v_row)
    RETURNING *;
  END LOOP;
END;
$$;

-- =====================================================================
-- PHẦN 6 — GRANTS & RLS
-- =====================================================================
-- Nguyên tắc: user thường đọc được dữ liệu công khai tối thiểu; mọi thao
-- tác nhạy cảm đi qua RPC SECURITY DEFINER ở trên. service_role full quyền.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- profiles: ai cũng đọc được (hồ sơ công khai), ghi chỉ qua RPC / chính chủ.
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT UPDATE (avatar, avatar_url, bio, display_name, full_name, gender, age, province, location, intent, is_online, updated_at)
  ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.bangchu TO authenticated;
GRANT ALL ON public.bangchu TO service_role;

GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL    ON public.admin_permissions TO service_role;

GRANT SELECT ON public.admin_site_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.admin_site_settings TO authenticated;
GRANT ALL ON public.admin_site_settings TO service_role;

GRANT SELECT ON public.admin_config TO authenticated;
GRANT ALL    ON public.admin_config TO service_role;

GRANT SELECT ON public.gem_transactions TO authenticated;
GRANT ALL    ON public.gem_transactions TO service_role;

GRANT SELECT ON public.coin_transactions TO authenticated;
GRANT ALL    ON public.coin_transactions TO service_role;

GRANT SELECT ON public.blocked_ips TO anon, authenticated;
GRANT ALL    ON public.blocked_ips TO service_role;

GRANT SELECT ON public.blocked_devices TO anon, authenticated;
GRANT ALL    ON public.blocked_devices TO service_role;

GRANT SELECT ON public.blocked_keywords TO authenticated;
GRANT ALL    ON public.blocked_keywords TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.blocked_keywords_id_seq TO authenticated;

GRANT SELECT ON public.banned_keywords TO authenticated;
GRANT ALL    ON public.banned_keywords TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.banned_keywords_id_seq TO authenticated;

GRANT SELECT ON public.forced_logouts TO authenticated;
GRANT ALL    ON public.forced_logouts TO service_role;

GRANT SELECT ON public.bot_accounts TO authenticated;
GRANT ALL    ON public.bot_accounts TO service_role;

GRANT SELECT ON public.bot_settings TO authenticated;
GRANT ALL    ON public.bot_settings TO service_role;

GRANT SELECT ON public.bot_roles TO authenticated;
GRANT ALL    ON public.bot_roles TO service_role;

GRANT SELECT ON public.nicktuongtac TO anon, authenticated;
GRANT ALL    ON public.nicktuongtac TO service_role;

-- Bảng mật khẩu nội bộ: KHÔNG cấp cho anon/authenticated.
REVOKE ALL ON public.internal_account_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.internal_account_credentials TO service_role;

-- Grants cho hàm
GRANT EXECUTE ON FUNCTION public.gen_profile_public_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._is_current_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public._is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_gem_balance(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_buff_gems(uuid[], bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_internal_gift_post(uuid, uuid, text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_block_device(uuid, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_block_user_ip(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_ban(uuid[], int, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_create_virtual_clones(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_bulk_create_virtual_clones(jsonb) FROM PUBLIC, anon;

-- RLS
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bangchu           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gem_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_devices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_keywords  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_keywords   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forced_logouts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nicktuongtac      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_account_credentials ENABLE ROW LEVEL SECURITY;

-- Policies tối thiểu (đọc công khai/đăng nhập; ghi qua SECURITY DEFINER).
DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_public_read ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
CREATE POLICY user_roles_self_read ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());

DROP POLICY IF EXISTS bangchu_auth_read ON public.bangchu;
CREATE POLICY bangchu_auth_read ON public.bangchu
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS bangchu_self_insert ON public.bangchu;
CREATE POLICY bangchu_self_insert ON public.bangchu
  FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
DROP POLICY IF EXISTS bangchu_admin_update ON public.bangchu;
CREATE POLICY bangchu_admin_update ON public.bangchu
  FOR UPDATE TO authenticated USING (public._is_current_admin());

DROP POLICY IF EXISTS admin_perms_read ON public.admin_permissions;
CREATE POLICY admin_perms_read ON public.admin_permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());

DROP POLICY IF EXISTS site_settings_public_read ON public.admin_site_settings;
CREATE POLICY site_settings_public_read ON public.admin_site_settings
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS site_settings_admin_write ON public.admin_site_settings;
CREATE POLICY site_settings_admin_write ON public.admin_site_settings
  FOR ALL TO authenticated USING (public._is_current_admin()) WITH CHECK (public._is_current_admin());

DROP POLICY IF EXISTS admin_config_admin_read ON public.admin_config;
CREATE POLICY admin_config_admin_read ON public.admin_config
  FOR SELECT TO authenticated USING (public._is_current_admin());

DROP POLICY IF EXISTS gem_tx_own_read ON public.gem_transactions;
CREATE POLICY gem_tx_own_read ON public.gem_transactions
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public._is_current_admin());

DROP POLICY IF EXISTS coin_tx_own_read ON public.coin_transactions;
CREATE POLICY coin_tx_own_read ON public.coin_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());

DROP POLICY IF EXISTS blocked_ips_read ON public.blocked_ips;
CREATE POLICY blocked_ips_read ON public.blocked_ips
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS blocked_devices_read ON public.blocked_devices;
CREATE POLICY blocked_devices_read ON public.blocked_devices
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS blocked_kw_admin_read ON public.blocked_keywords;
CREATE POLICY blocked_kw_admin_read ON public.blocked_keywords
  FOR SELECT TO authenticated USING (public._is_current_admin());

DROP POLICY IF EXISTS banned_kw_admin_read ON public.banned_keywords;
CREATE POLICY banned_kw_admin_read ON public.banned_keywords
  FOR SELECT TO authenticated USING (public._is_current_admin());
DROP POLICY IF EXISTS banned_kw_admin_write ON public.banned_keywords;
CREATE POLICY banned_kw_admin_write ON public.banned_keywords
  FOR ALL TO authenticated USING (public._is_current_admin()) WITH CHECK (public._is_current_admin());

DROP POLICY IF EXISTS forced_logouts_self_read ON public.forced_logouts;
CREATE POLICY forced_logouts_self_read ON public.forced_logouts
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());

DROP POLICY IF EXISTS bot_accounts_admin_read ON public.bot_accounts;
CREATE POLICY bot_accounts_admin_read ON public.bot_accounts
  FOR SELECT TO authenticated USING (public._is_current_admin());

DROP POLICY IF EXISTS bot_settings_admin_read ON public.bot_settings;
CREATE POLICY bot_settings_admin_read ON public.bot_settings
  FOR SELECT TO authenticated USING (public._is_current_admin());

DROP POLICY IF EXISTS bot_roles_admin_read ON public.bot_roles;
CREATE POLICY bot_roles_admin_read ON public.bot_roles
  FOR SELECT TO authenticated USING (public._is_current_admin());

DROP POLICY IF EXISTS nicktuongtac_public_read ON public.nicktuongtac;
CREATE POLICY nicktuongtac_public_read ON public.nicktuongtac
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- internal_account_credentials: không policy → RLS chặn hết (chỉ service_role).

COMMIT;

-- =====================================================================
-- PHẦN 7 — PHONG SUPER ADMIN CHO TÀI KHOẢN BANG CHỦ ĐẦU TIÊN
--   1. Đăng ký 1 tài khoản qua app (hoặc Dashboard → Authentication → Add user).
--   2. Lấy UID:  SELECT id, email FROM auth.users ORDER BY created_at;
--   3. Bỏ comment 2 dòng dưới, thay <UID_CUA_BAN>, rồi chạy lại riêng đoạn này.
-- =====================================================================
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('<UID_CUA_BAN>'::uuid, 'super_admin')
-- ON CONFLICT DO NOTHING;
--
-- UPDATE public.profiles SET is_admin = true, role = 'super_admin'
--  WHERE id = '<UID_CUA_BAN>'::uuid;

-- =====================================================================
-- PHẦN 8 — NHẮC KEY .env (sau khi chạy xong SQL)
-- =====================================================================
--   VITE_SUPABASE_URL_1=https://<PROJECT_REF_MOI>.supabase.co
--   VITE_SUPABASE_ANON_KEY_1=<anon public key mới>
--
-- Cập nhật src/lib/db/config.ts (block PRIMARY) để đọc 2 biến trên:
--   url:     pick(env["VITE_SUPABASE_URL_1"], env["VITE_SUPABASE_URL"] ...)
--   anonKey: env["VITE_SUPABASE_ANON_KEY_1"] || env["VITE_SUPABASE_PUBLISHABLE_KEY"] || ...
-- =====================================================================
