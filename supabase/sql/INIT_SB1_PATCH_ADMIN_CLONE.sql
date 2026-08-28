-- =====================================================================
-- INIT_SB1_PATCH_ADMIN_CLONE.sql
-- Bản vá bổ sung cho Supabase #1 MỚI (chạy SAU supabase/sql/INIT_CLEAN_SB1.sql)
-- Nội dung: Clone/Internal Accounts, Chuyển tiền & Rút tiền, Quyền Admin & Bảo mật.
-- An toàn chạy lại nhiều lần (idempotent).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- PHẦN 0 — TIỆN ÍCH DÙNG CHUNG
-- =====================================================================

-- Bảo đảm các cột phụ mà patch này cần trên profiles.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS following_count bigint NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS posts_count     bigint NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_internal     boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone           text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_checkin_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS checkin_streak  int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS profiles_internal_idx ON public.profiles (is_internal) WHERE is_internal;

-- Ghi log hành động admin (bảng log nằm ở SB#3, ở đây chỉ no-op an toàn).
CREATE OR REPLACE FUNCTION public._admin_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_current_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: chỉ admin mới được thực hiện thao tác này';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public._super_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: chỉ Bang Chủ / Super Admin mới được thực hiện thao tác này';
  END IF;
END; $$;

-- =====================================================================
-- PHẦN 1 — BẢNG: CLONE / INTERNAL ACCOUNTS
-- =====================================================================

-- 1.1 bot_assignments — gán nick clone cho bot / chiến dịch tương tác.
CREATE TABLE IF NOT EXISTS public.bot_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id       uuid,
  account_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id    uuid,
  target_type  text NOT NULL DEFAULT 'user',   -- user | post | group
  task         text NOT NULL DEFAULT 'chat',   -- chat | like | comment | follow
  status       text NOT NULL DEFAULT 'active', -- active | paused | done
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at  timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_assignments_account_idx ON public.bot_assignments(account_id);
CREATE INDEX IF NOT EXISTS bot_assignments_status_idx  ON public.bot_assignments(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_assignments TO authenticated;
GRANT ALL ON public.bot_assignments TO service_role;
ALTER TABLE public.bot_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bot_assignments_admin_all ON public.bot_assignments;
CREATE POLICY bot_assignments_admin_all ON public.bot_assignments
  FOR ALL TO authenticated USING (public._is_current_admin()) WITH CHECK (public._is_current_admin());

-- 1.2 fake_profiles — nick ảo FWB / buff follower (không gắn auth.users).
CREATE TABLE IF NOT EXISTS public.fake_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text UNIQUE,
  full_name     text,
  display_name  text,
  avatar        text,
  avatar_url    text,
  bio           text,
  gender        text,
  age           int,
  province      text,
  followers     bigint NOT NULL DEFAULT 0,
  following     bigint NOT NULL DEFAULT 0,
  posts         bigint NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  admin_online  boolean NOT NULL DEFAULT false,
  auto_reply    boolean NOT NULL DEFAULT false,
  reply_script  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fake_profiles_active_idx   ON public.fake_profiles(is_active);
CREATE INDEX IF NOT EXISTS fake_profiles_province_idx ON public.fake_profiles(province);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fake_profiles TO authenticated;
GRANT SELECT ON public.fake_profiles TO anon;
GRANT ALL ON public.fake_profiles TO service_role;
ALTER TABLE public.fake_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fake_profiles_read ON public.fake_profiles;
CREATE POLICY fake_profiles_read ON public.fake_profiles
  FOR SELECT TO anon, authenticated USING (is_active OR public._is_current_admin());
DROP POLICY IF EXISTS fake_profiles_admin_write ON public.fake_profiles;
CREATE POLICY fake_profiles_admin_write ON public.fake_profiles
  FOR ALL TO authenticated USING (public._is_current_admin()) WITH CHECK (public._is_current_admin());

-- 1.3 seed_accounts — nick mồi có hồ sơ hiển thị công khai.
CREATE TABLE IF NOT EXISTS public.seed_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  username      text UNIQUE,
  full_name     text,
  display_name  text,
  avatar        text,
  avatar_url    text,
  bio           text,
  gender        text,
  age           int,
  province      text,
  batch         text,
  is_active     boolean NOT NULL DEFAULT true,
  chat_enabled  boolean NOT NULL DEFAULT true,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seed_accounts_batch_idx  ON public.seed_accounts(batch);
CREATE INDEX IF NOT EXISTS seed_accounts_active_idx ON public.seed_accounts(is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seed_accounts TO authenticated;
GRANT SELECT ON public.seed_accounts TO anon;
GRANT ALL ON public.seed_accounts TO service_role;
ALTER TABLE public.seed_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seed_accounts_read ON public.seed_accounts;
CREATE POLICY seed_accounts_read ON public.seed_accounts
  FOR SELECT TO anon, authenticated USING (is_active OR public._is_current_admin());
DROP POLICY IF EXISTS seed_accounts_admin_write ON public.seed_accounts;
CREATE POLICY seed_accounts_admin_write ON public.seed_accounts
  FOR ALL TO authenticated USING (public._is_current_admin()) WITH CHECK (public._is_current_admin());

-- View gộp seed (code cũ đọc v_seed_accounts).
CREATE OR REPLACE VIEW public.v_seed_accounts AS
  SELECT p.id, p.username, p.full_name, p.avatar, p.province, p.gender,
         'profiles'::text AS source_table, true AS is_active
    FROM public.profiles p WHERE p.is_virtual OR p.is_seed_account
  UNION ALL
  SELECT f.id, f.username, f.full_name, f.avatar, f.province, f.gender,
         'fake_profiles'::text AS source_table, f.is_active
    FROM public.fake_profiles f;
GRANT SELECT ON public.v_seed_accounts TO anon, authenticated;

-- 1.4 Bao lì xì nội bộ (cụm red_packet).
CREATE TABLE IF NOT EXISTS public.red_packets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       bigint NOT NULL CHECK (amount > 0),
  wish         text,
  status       text NOT NULL DEFAULT 'pending', -- pending | opened | expired
  opened_at    timestamptz,
  opened_by    uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS red_packets_receiver_idx ON public.red_packets(receiver_id, status);

GRANT SELECT, INSERT, UPDATE ON public.red_packets TO authenticated;
GRANT ALL ON public.red_packets TO service_role;
ALTER TABLE public.red_packets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS red_packets_party_read ON public.red_packets;
CREATE POLICY red_packets_party_read ON public.red_packets
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public._is_current_admin());

-- =====================================================================
-- PHẦN 2 — RPC QUẢN LÝ CLONE / INTERNAL ACCOUNTS
-- =====================================================================

-- 2.1 Danh sách nick nội bộ.
DROP FUNCTION IF EXISTS public.admin_list_internal_accounts(text, int, int, text);
CREATE OR REPLACE FUNCTION public.admin_list_internal_accounts(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 20,
  p_offset int  DEFAULT 0,
  p_gender text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, bio text,
  province text, gender text, is_banned boolean, created_at timestamptz,
  followers bigint, following bigint, posts bigint, gem_balance bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, COALESCE(p.avatar, p.avatar_url), p.bio,
         p.province, p.gender, p.is_banned, p.created_at,
         p.followers_count, p.following_count, p.posts_count, p.gem_balance
    FROM public.profiles p
   WHERE (p.is_internal OR p.is_clone OR p.is_virtual OR p.is_seed_account)
     AND (p_gender IS NULL OR p_gender = '' OR p.gender = p_gender)
     AND (
       p_search IS NULL OR btrim(p_search) = '' OR
       p.username ILIKE '%' || p_search || '%' OR
       COALESCE(p.full_name, '') ILIKE '%' || p_search || '%' OR
       COALESCE(p.public_id, '') ILIKE '%' || p_search || '%'
     )
   ORDER BY p.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END; $$;

-- 2.2 Cập nhật thông tin nick nội bộ.
CREATE OR REPLACE FUNCTION public.admin_update_internal_account(
  p_id         uuid,
  p_username   text DEFAULT NULL,
  p_password   text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_bio        text DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_full_name  text DEFAULT NULL,
  p_gender     text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();

  IF p_username IS NOT NULL AND btrim(p_username) <> '' THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(btrim(p_username)) AND id <> p_id) THEN
      RAISE EXCEPTION 'USERNAME_TAKEN: @% đã tồn tại', p_username;
    END IF;
    UPDATE public.profiles SET username = btrim(p_username) WHERE id = p_id;
    UPDATE auth.users SET email = lower(btrim(p_username)) || '@internal.local' WHERE id = p_id;
  END IF;

  UPDATE public.profiles SET
    avatar       = COALESCE(NULLIF(btrim(COALESCE(p_avatar_url, '')), ''), avatar),
    avatar_url   = COALESCE(NULLIF(btrim(COALESCE(p_avatar_url, '')), ''), avatar_url),
    bio          = COALESCE(p_bio, bio),
    province     = COALESCE(p_province, province),
    full_name    = COALESCE(NULLIF(btrim(COALESCE(p_full_name, '')), ''), full_name),
    display_name = COALESCE(NULLIF(btrim(COALESCE(p_full_name, '')), ''), display_name),
    gender       = COALESCE(NULLIF(btrim(COALESCE(p_gender, '')), ''), gender),
    updated_at   = now()
  WHERE id = p_id;

  IF p_password IS NOT NULL AND length(btrim(p_password)) >= 6 THEN
    UPDATE auth.users
       SET encrypted_password = crypt(btrim(p_password), gen_salt('bf')),
           updated_at = now()
     WHERE id = p_id;
    INSERT INTO public.internal_account_credentials(profile_id, password, updated_at)
    VALUES (p_id, btrim(p_password), now())
    ON CONFLICT (profile_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END; $$;

-- 2.3 Set số Gem cho nick nội bộ.
CREATE OR REPLACE FUNCTION public.admin_set_internal_account_gem(p_id uuid, p_gem bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old bigint;
BEGIN
  PERFORM public._admin_guard();
  SELECT gem_balance INTO v_old FROM public.profiles WHERE id = p_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: tài khoản không tồn tại'; END IF;

  UPDATE public.profiles SET gem_balance = GREATEST(COALESCE(p_gem, 0), 0), updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.gem_transactions(user_id, amount, type, description, created_by)
  VALUES (p_id, GREATEST(COALESCE(p_gem, 0), 0) - v_old, 'admin_set', 'Admin set gem nick nội bộ', auth.uid());

  RETURN jsonb_build_object('ok', true, 'old', v_old, 'new', GREATEST(COALESCE(p_gem, 0), 0));
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RETURN jsonb_build_object('ok', true, 'new', GREATEST(COALESCE(p_gem, 0), 0));
END; $$;

-- 2.4 Set chỉ số ảo (followers/following/posts/ngày tạo/giới tính).
CREATE OR REPLACE FUNCTION public.admin_set_internal_account_stats(
  p_id         uuid,
  p_followers  bigint      DEFAULT NULL,
  p_following  bigint      DEFAULT NULL,
  p_posts      bigint      DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL,
  p_gender     text        DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  UPDATE public.profiles SET
    followers_count = COALESCE(p_followers, followers_count),
    following_count = COALESCE(p_following, following_count),
    posts_count     = COALESCE(p_posts, posts_count),
    created_at      = COALESCE(p_created_at, created_at),
    gender          = COALESCE(NULLIF(btrim(COALESCE(p_gender, '')), ''), gender),
    updated_at      = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 2.5 Khoá / mở khoá 1 nick.
CREATE OR REPLACE FUNCTION public.admin_lock_internal_account(p_id uuid, p_locked boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  UPDATE public.profiles SET
    is_banned  = COALESCE(p_locked, false),
    status     = CASE WHEN p_locked THEN 'locked' ELSE 'active' END,
    banned_at  = CASE WHEN p_locked THEN now() ELSE NULL END,
    banned_by  = CASE WHEN p_locked THEN auth.uid() ELSE NULL END,
    ban_reason = CASE WHEN p_locked THEN 'Admin khoá nick nội bộ' ELSE NULL END,
    updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'locked', COALESCE(p_locked, false));
END; $$;

-- 2.6 Khoá / mở khoá hàng loạt.
CREATE OR REPLACE FUNCTION public.admin_bulk_lock_internal_accounts(p_ids uuid[], p_locked boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0;
BEGIN
  PERFORM public._admin_guard();
  UPDATE public.profiles SET
    is_banned  = COALESCE(p_locked, false),
    status     = CASE WHEN p_locked THEN 'locked' ELSE 'active' END,
    banned_at  = CASE WHEN p_locked THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = ANY(COALESCE(p_ids, '{}'::uuid[]));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

-- 2.7 Xoá 1 nick nội bộ (xoá luôn auth.users → cascade profiles).
CREATE OR REPLACE FUNCTION public.admin_delete_internal_account(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id AND NOT (is_internal OR is_clone OR is_virtual OR is_seed_account)) THEN
    PERFORM public._super_guard();
  END IF;
  DELETE FROM auth.users WHERE id = p_id;
  DELETE FROM public.profiles WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 2.8 Xoá hàng loạt.
CREATE OR REPLACE FUNCTION public.admin_delete_internal_accounts(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0;
BEGIN
  PERFORM public._admin_guard();
  SELECT count(*) INTO n
    FROM public.profiles
   WHERE id = ANY(COALESCE(p_ids, '{}'::uuid[]))
     AND (is_internal OR is_clone OR is_virtual OR is_seed_account);
  DELETE FROM auth.users
   WHERE id = ANY(COALESCE(p_ids, '{}'::uuid[]))
     AND id IN (SELECT id FROM public.profiles WHERE is_internal OR is_clone OR is_virtual OR is_seed_account);
  DELETE FROM public.profiles
   WHERE id = ANY(COALESCE(p_ids, '{}'::uuid[]))
     AND (is_internal OR is_clone OR is_virtual OR is_seed_account);
  RETURN n;
END; $$;

-- 2.9 Xoá sạch toàn bộ tài khoản (trừ admin) — cần mật khẩu + mã admin.
CREATE OR REPLACE FUNCTION public.admin_purge_all_accounts(
  _confirm        text,
  _admin_password text,
  _admin_code     text
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer := 0;
  v_hash text;
  v_code text;
BEGIN
  PERFORM public._super_guard();

  IF upper(COALESCE(_confirm, '')) <> 'XOA TAT CA' AND upper(COALESCE(_confirm, '')) <> 'DELETE ALL' THEN
    RAISE EXCEPTION 'CONFIRM_REQUIRED: gõ đúng "XOA TAT CA" để xác nhận';
  END IF;

  SELECT encrypted_password INTO v_hash FROM auth.users WHERE id = auth.uid();
  IF v_hash IS NULL OR crypt(COALESCE(_admin_password, ''), v_hash) <> v_hash THEN
    RAISE EXCEPTION 'WRONG_PASSWORD: sai mật khẩu admin';
  END IF;

  SELECT value INTO v_code FROM public.admin_config WHERE key = 'capadmin_hash';
  IF v_code IS NOT NULL AND crypt(COALESCE(_admin_code, ''), v_code) <> v_code THEN
    RAISE EXCEPTION 'WRONG_CODE: sai mã cấp admin';
  END IF;

  SELECT count(*) INTO n
    FROM public.profiles p
   WHERE p.id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id = p.id AND r.role::text IN ('admin','super_admin'));

  DELETE FROM auth.users u
   WHERE u.id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id = u.id AND r.role::text IN ('admin','super_admin'));

  RETURN n;
END; $$;

-- 2.10 Tạo 1 tài khoản thật từ admin (auth.users + profiles).
CREATE OR REPLACE FUNCTION public.admin_signup_account(p_row jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_username text := lower(btrim(COALESCE(p_row->>'username', '')));
  v_password text := COALESCE(p_row->>'password', '');
  v_uid      uuid := gen_random_uuid();
  v_email    text;
BEGIN
  PERFORM public._admin_guard();

  IF v_username !~ '^[a-z0-9_]{3,30}$' THEN
    RETURN jsonb_build_object('ok', false, 'username', v_username, 'error', 'Username không hợp lệ (3-30 ký tự a-z, 0-9, _)');
  END IF;
  IF length(v_password) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'username', v_username, 'error', 'Mật khẩu tối thiểu 6 ký tự');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_username) THEN
    RETURN jsonb_build_object('ok', false, 'username', v_username, 'error', 'Username đã tồn tại');
  END IF;

  v_email := COALESCE(NULLIF(btrim(COALESCE(p_row->>'email', '')), ''), v_username || '@internal.local');

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, crypt(v_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('username', v_username, 'full_name', COALESCE(p_row->>'full_name', v_username)),
    COALESCE((p_row->>'created_at')::timestamptz, now()), now()
  );

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, v_uid::text,
          jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (
    id, username, full_name, display_name, avatar, avatar_url, bio, gender, age, province,
    gem_balance, followers_count, following_count, posts_count,
    is_internal, is_clone, is_seed_account, created_at
  ) VALUES (
    v_uid, v_username,
    COALESCE(p_row->>'full_name', v_username), COALESCE(p_row->>'full_name', v_username),
    p_row->>'avatar', p_row->>'avatar', p_row->>'bio', p_row->>'gender',
    NULLIF(p_row->>'age', '')::int, p_row->>'province',
    COALESCE(NULLIF(p_row->>'gem', '')::bigint, 0),
    COALESCE(NULLIF(p_row->>'followers', '')::bigint, 0),
    COALESCE(NULLIF(p_row->>'following', '')::bigint, 0),
    COALESCE(NULLIF(p_row->>'posts', '')::bigint, 0),
    true, true, true,
    COALESCE((p_row->>'created_at')::timestamptz, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username, full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name, is_internal = true, is_clone = true;

  INSERT INTO public.internal_account_credentials(profile_id, password)
  VALUES (v_uid, v_password)
  ON CONFLICT (profile_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'id', v_uid, 'username', v_username);
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'username', v_username, 'error', sqlerrm);
END; $$;

-- 2.11 Tạo hàng loạt.
CREATE OR REPLACE FUNCTION public.admin_bulk_signup(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; out_rows jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._admin_guard();
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    out_rows := out_rows || jsonb_build_array(public.admin_signup_account(r));
  END LOOP;
  RETURN out_rows;
END; $$;

-- 2.12 Kiểm tra username đã tồn tại.
CREATE OR REPLACE FUNCTION public.admin_check_usernames(p_usernames text[])
RETURNS TABLE (username text, taken boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  RETURN QUERY
  SELECT u AS username,
         EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(u)) AS taken
    FROM unnest(COALESCE(p_usernames, '{}'::text[])) AS u;
END; $$;

-- 2.13 Danh sách user THẬT (để nick nội bộ nhắn tin).
CREATE OR REPLACE FUNCTION public.admin_internal_real_users(
  p_search text DEFAULT NULL,
  p_since  timestamptz DEFAULT NULL,
  p_limit  int DEFAULT 1000
)
RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, public_id text,
  gender text, province text, is_online boolean, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, COALESCE(p.avatar, p.avatar_url), p.public_id,
         p.gender, p.province, p.is_online, p.created_at
    FROM public.profiles p
   WHERE COALESCE(p.account_source, '') <> 'internal'
     AND COALESCE(p.is_internal, false) = false
     AND COALESCE(p.is_clone, false) = false
     AND COALESCE(p.is_virtual, false) = false
     AND COALESCE(p.is_seed_account, false) = false
     AND (p_since IS NULL OR p.created_at >= p_since)
     AND (p_search IS NULL OR btrim(p_search) = ''
          OR p.username ILIKE '%' || p_search || '%'
          OR COALESCE(p.full_name, '') ILIKE '%' || p_search || '%'
          OR COALESCE(p.public_id, '') ILIKE '%' || p_search || '%')
   ORDER BY p.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 1000), 1);
END; $$;

-- 2.14 Cụm red_packet (nick nội bộ gửi / xem / mở lì xì).
CREATE OR REPLACE FUNCTION public.admin_internal_send_red_packet(
  p_account uuid, p_peer uuid, p_amount bigint, p_wish text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal bigint; v_id uuid;
BEGIN
  PERFORM public._admin_guard();
  IF COALESCE(p_amount, 0) < 1000 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Số xu tối thiểu 1.000');
  END IF;

  SELECT gem_balance INTO v_bal FROM public.profiles WHERE id = p_account FOR UPDATE;
  IF v_bal IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Nick gửi không tồn tại'); END IF;
  IF v_bal < p_amount THEN RETURN jsonb_build_object('ok', false, 'message', 'Nick gửi không đủ xu'); END IF;

  UPDATE public.profiles SET gem_balance = gem_balance - p_amount, updated_at = now() WHERE id = p_account;

  INSERT INTO public.red_packets(sender_id, receiver_id, amount, wish)
  VALUES (p_account, p_peer, p_amount, p_wish)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'amount', p_amount);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_internal_get_red_packet(p_account uuid, p_packet uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public._admin_guard();
  SELECT to_jsonb(rp) INTO v FROM public.red_packets rp
   WHERE rp.id = p_packet AND (rp.sender_id = p_account OR rp.receiver_id = p_account);
  RETURN COALESCE(v, jsonb_build_object('ok', false, 'message', 'Không tìm thấy bao lì xì'));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_internal_open_red_packet(p_account uuid, p_packet uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amount bigint; v_status text;
BEGIN
  PERFORM public._admin_guard();
  SELECT amount, status INTO v_amount, v_status
    FROM public.red_packets WHERE id = p_packet AND receiver_id = p_account FOR UPDATE;
  IF v_amount IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy bao lì xì'); END IF;
  IF v_status = 'opened' THEN RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OPENED', 'message', 'Đã mở rồi'); END IF;

  UPDATE public.red_packets SET status = 'opened', opened_at = now(), opened_by = p_account WHERE id = p_packet;
  UPDATE public.profiles SET gem_balance = gem_balance + v_amount, updated_at = now() WHERE id = p_account;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount);
END; $$;

-- =====================================================================
-- PHẦN 3 — CHUYỂN TIỀN & RÚT TIỀN
-- =====================================================================

-- 3.1 transfer_transactions
CREATE TABLE IF NOT EXISTS public.transfer_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount        bigint NOT NULL CHECK (amount > 0),
  fee           bigint NOT NULL DEFAULT 0,
  net_amount    bigint NOT NULL DEFAULT 0,
  note          text,
  status        text NOT NULL DEFAULT 'completed', -- pending | completed | claimed | cancelled
  claimed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfer_tx_sender_idx   ON public.transfer_transactions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transfer_tx_receiver_idx ON public.transfer_transactions(receiver_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.transfer_transactions TO authenticated;
GRANT ALL ON public.transfer_transactions TO service_role;
ALTER TABLE public.transfer_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transfer_tx_party_read ON public.transfer_transactions;
CREATE POLICY transfer_tx_party_read ON public.transfer_transactions
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public._is_current_admin());

-- 3.2 withdrawal_requests
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text UNIQUE,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount         bigint NOT NULL CHECK (amount > 0),
  fee            bigint NOT NULL DEFAULT 0,
  net_amount     bigint NOT NULL DEFAULT 0,
  bank_name      text NOT NULL,
  bank_account   text NOT NULL,
  account_holder text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  note           text,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawal_status_idx ON public.withdrawal_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_user_idx   ON public.withdrawal_requests(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS withdrawal_own_read ON public.withdrawal_requests;
CREATE POLICY withdrawal_own_read ON public.withdrawal_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());

-- 3.3 secure_transfer_gem — chuyển Gem trực tiếp (có khoá hàng, chống âm ví).
CREATE OR REPLACE FUNCTION public.secure_transfer_gem(
  p_receiver_id uuid, p_amount bigint, p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_bal bigint;
  v_id uuid;
BEGIN
  IF v_sender IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Chưa đăng nhập'); END IF;
  IF p_receiver_id IS NULL OR p_receiver_id = v_sender THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Người nhận không hợp lệ');
  END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Số xu không hợp lệ');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_sender AND is_banned) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Tài khoản đang bị khoá');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Người nhận không tồn tại');
  END IF;

  SELECT gem_balance INTO v_bal FROM public.profiles WHERE id = v_sender FOR UPDATE;
  IF COALESCE(v_bal, 0) < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT', 'message', 'Số dư không đủ');
  END IF;

  UPDATE public.profiles SET gem_balance = gem_balance - p_amount, updated_at = now() WHERE id = v_sender;
  UPDATE public.profiles SET gem_balance = gem_balance + p_amount, updated_at = now() WHERE id = p_receiver_id;

  INSERT INTO public.transfer_transactions(sender_id, receiver_id, amount, net_amount, note, status)
  VALUES (v_sender, p_receiver_id, p_amount, p_amount, p_note, 'completed')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'amount', p_amount,
                            'balance', COALESCE(v_bal, 0) - p_amount);
END; $$;

-- 3.4 transfer_balance — chuyển xu theo public_id, người nhận phải "claim".
CREATE OR REPLACE FUNCTION public.transfer_balance(
  p_receiver_uid text, p_amount bigint, p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_receiver uuid;
  v_bal bigint;
  v_id uuid;
BEGIN
  IF v_sender IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Chưa đăng nhập'); END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN RETURN jsonb_build_object('ok', false, 'message', 'Số xu không hợp lệ'); END IF;

  SELECT id INTO v_receiver FROM public.profiles
   WHERE upper(public_id) = upper(btrim(COALESCE(p_receiver_uid, '')))
      OR lower(username)  = lower(btrim(COALESCE(p_receiver_uid, '')))
   LIMIT 1;
  IF v_receiver IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy người nhận'); END IF;
  IF v_receiver = v_sender THEN RETURN jsonb_build_object('ok', false, 'message', 'Không thể tự chuyển cho chính mình'); END IF;

  SELECT gem_balance INTO v_bal FROM public.profiles WHERE id = v_sender FOR UPDATE;
  IF COALESCE(v_bal, 0) < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT', 'message', 'Số dư không đủ');
  END IF;

  UPDATE public.profiles SET gem_balance = gem_balance - p_amount, updated_at = now() WHERE id = v_sender;

  INSERT INTO public.transfer_transactions(sender_id, receiver_id, amount, net_amount, note, status)
  VALUES (v_sender, v_receiver, p_amount, p_amount, p_note, 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'receiver_id', v_receiver, 'amount', p_amount);
END; $$;

-- 3.5 claim_transfer — người nhận bấm "Nhận xu".
CREATE OR REPLACE FUNCTION public.claim_transfer(p_transfer_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_amount bigint;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Chưa đăng nhập'); END IF;

  SELECT amount, status INTO v_amount, v_status
    FROM public.transfer_transactions
   WHERE id = p_transfer_id::uuid AND receiver_id = v_uid
   FOR UPDATE;

  IF v_amount IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy giao dịch'); END IF;
  IF v_status IN ('claimed', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED', 'message', 'Giao dịch đã được nhận');
  END IF;

  UPDATE public.transfer_transactions
     SET status = 'claimed', claimed_at = now()
   WHERE id = p_transfer_id::uuid;

  UPDATE public.profiles SET gem_balance = gem_balance + v_amount, updated_at = now() WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount);
END; $$;

-- 3.6 daily_checkin — điểm danh mỗi ngày.
CREATE OR REPLACE FUNCTION public.daily_checkin()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_streak int;
  v_reward bigint := 100;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Chưa đăng nhập'); END IF;

  SELECT last_checkin_at, checkin_streak INTO v_last, v_streak
    FROM public.profiles WHERE id = v_uid FOR UPDATE;

  IF v_last IS NOT NULL AND v_last::date = now()::date THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CHECKED', 'streak', COALESCE(v_streak, 0));
  END IF;

  v_streak := CASE WHEN v_last IS NOT NULL AND v_last::date = (now() - interval '1 day')::date
                   THEN COALESCE(v_streak, 0) + 1 ELSE 1 END;
  v_reward := 100 * LEAST(v_streak, 7);

  UPDATE public.profiles
     SET last_checkin_at = now(),
         checkin_streak  = v_streak,
         gem_balance     = gem_balance + v_reward,
         updated_at      = now()
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'streak', v_streak, 'reward', v_reward);
END; $$;

-- 3.7 create_withdrawal_request
CREATE OR REPLACE FUNCTION public.create_withdrawal_request(
  p_amount         bigint,
  p_bank_name      text,
  p_bank_account   text,
  p_account_holder text
)
RETURNS TABLE (id uuid, code text, amount bigint, fee bigint, net_amount bigint, status text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bal bigint;
  v_fee bigint;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED: chưa đăng nhập'; END IF;
  IF COALESCE(p_amount, 0) < 10000 THEN RAISE EXCEPTION 'MIN_AMOUNT: số xu rút tối thiểu 10.000'; END IF;
  IF btrim(COALESCE(p_bank_name, '')) = '' OR btrim(COALESCE(p_bank_account, '')) = ''
     OR btrim(COALESCE(p_account_holder, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_BANK: thiếu thông tin ngân hàng';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_banned) THEN
    RAISE EXCEPTION 'BANNED: tài khoản đang bị khoá';
  END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawal_requests w WHERE w.user_id = v_uid AND w.status = 'pending') THEN
    RAISE EXCEPTION 'PENDING_EXISTS: bạn còn 1 yêu cầu đang chờ duyệt';
  END IF;

  SELECT gem_balance INTO v_bal FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF COALESCE(v_bal, 0) < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT: số dư không đủ'; END IF;

  v_fee  := (p_amount * 5) / 100;                       -- phí 5%
  v_code := 'WD' || to_char(now(), 'YYMMDD') || upper(substr(md5(random()::text), 1, 5));

  UPDATE public.profiles SET gem_balance = gem_balance - p_amount, updated_at = now() WHERE id = v_uid;

  RETURN QUERY
  INSERT INTO public.withdrawal_requests(
    code, user_id, amount, fee, net_amount, bank_name, bank_account, account_holder, status
  ) VALUES (
    v_code, v_uid, p_amount, v_fee, p_amount - v_fee,
    btrim(p_bank_name), btrim(p_bank_account), btrim(p_account_holder), 'pending'
  )
  RETURNING withdrawal_requests.id, withdrawal_requests.code, withdrawal_requests.amount,
            withdrawal_requests.fee, withdrawal_requests.net_amount,
            withdrawal_requests.status, withdrawal_requests.created_at;
END; $$;

-- 3.8 review_withdrawal_request — duyệt / từ chối (từ chối = hoàn xu).
CREATE OR REPLACE FUNCTION public.review_withdrawal_request(
  p_id uuid, p_approve boolean, p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_amount bigint; v_status text;
BEGIN
  PERFORM public._admin_guard();

  SELECT user_id, amount, status INTO v_user, v_amount, v_status
    FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: không tìm thấy yêu cầu'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'ALREADY_REVIEWED: yêu cầu đã được xử lý'; END IF;

  UPDATE public.withdrawal_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_id;

  IF NOT p_approve THEN
    UPDATE public.profiles SET gem_balance = gem_balance + v_amount, updated_at = now() WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object('ok', true, 'approved', p_approve);
END; $$;

-- 3.9 list_withdrawal_requests (+ alias admin_list_withdrawal_requests, my_withdrawal_requests).
CREATE OR REPLACE FUNCTION public.list_withdrawal_requests(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, code text, user_id uuid, amount bigint, fee bigint, net_amount bigint,
  bank_name text, bank_account text, account_holder text, status text,
  note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  RETURN QUERY
  SELECT w.id, w.code, w.user_id, w.amount, w.fee, w.net_amount,
         w.bank_name, w.bank_account, w.account_holder, w.status,
         w.note, w.reviewed_by, w.reviewed_at, w.created_at
    FROM public.withdrawal_requests w
   WHERE (p_status IS NULL OR btrim(p_status) = '' OR w.status = p_status)
   ORDER BY w.created_at DESC
   LIMIT 500;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_withdrawal_requests(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, code text, user_id uuid, amount bigint, fee bigint, net_amount bigint,
  bank_name text, bank_account text, account_holder text, status text,
  note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.list_withdrawal_requests(p_status);
$$;

CREATE OR REPLACE FUNCTION public.my_withdrawal_requests()
RETURNS TABLE (id uuid, code text, amount bigint, fee bigint, net_amount bigint,
               status text, note text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.code, w.amount, w.fee, w.net_amount, w.status, w.note, w.created_at
    FROM public.withdrawal_requests w
   WHERE w.user_id = auth.uid()
   ORDER BY w.created_at DESC
   LIMIT 200;
$$;

-- =====================================================================
-- PHẦN 4 — BẢNG QUYỀN ADMIN & BẢO MẬT
-- =====================================================================

-- 4.1 admin_role_assignments
CREATE TABLE IF NOT EXISTS public.admin_role_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL,               -- super_admin | admin_1 | admin_2 | moderator | agent
  suspended    boolean NOT NULL DEFAULT false,
  assigned_by  uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.admin_role_assignments TO authenticated;
GRANT ALL ON public.admin_role_assignments TO service_role;
ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_role_assignments_read ON public.admin_role_assignments;
CREATE POLICY admin_role_assignments_read ON public.admin_role_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());

-- 4.2 user_restrictions
CREATE TABLE IF NOT EXISTS public.user_restrictions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL,             -- mute | no_post | no_comment | no_transfer | ban
  level         smallint NOT NULL DEFAULT 1,
  reason        text,
  expires_at    timestamptz,
  is_permanent  boolean NOT NULL DEFAULT false,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_restrictions_user_idx ON public.user_restrictions(user_id, kind);
GRANT SELECT ON public.user_restrictions TO authenticated;
GRANT ALL ON public.user_restrictions TO service_role;
ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_restrictions_read ON public.user_restrictions;
CREATE POLICY user_restrictions_read ON public.user_restrictions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());

-- 4.3 phone_verifications
CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone        text NOT NULL,
  code_hash    text,
  verified     boolean NOT NULL DEFAULT false,
  verified_at  timestamptz,
  attempts     int NOT NULL DEFAULT 0,
  blocked      boolean NOT NULL DEFAULT false,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_verifications_phone_idx ON public.phone_verifications(phone);
GRANT SELECT, INSERT ON public.phone_verifications TO authenticated;
GRANT ALL ON public.phone_verifications TO service_role;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phone_verifications_own ON public.phone_verifications;
CREATE POLICY phone_verifications_own ON public.phone_verifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());

-- 4.4 profile_verifications (tick xanh / xác minh hồ sơ)
CREATE TABLE IF NOT EXISTS public.profile_verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL DEFAULT 'identity',  -- identity | face | bank
  status       text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  evidence_url text,
  note         text,
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_verifications_status_idx ON public.profile_verifications(status);
GRANT SELECT, INSERT ON public.profile_verifications TO authenticated;
GRANT ALL ON public.profile_verifications TO service_role;
ALTER TABLE public.profile_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profile_verifications_own ON public.profile_verifications;
CREATE POLICY profile_verifications_own ON public.profile_verifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._is_current_admin());
DROP POLICY IF EXISTS profile_verifications_insert_own ON public.profile_verifications;
CREATE POLICY profile_verifications_insert_own ON public.profile_verifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 4.5 device_approval_settings (bảng cấu hình + RPC cùng tên cho code cũ)
CREATE TABLE IF NOT EXISTS public.device_approval_settings (
  key         text PRIMARY KEY DEFAULT 'default',
  mode        text NOT NULL DEFAULT 'open',   -- open | approval | closed
  auto_approve boolean NOT NULL DEFAULT true,
  message     text,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.device_approval_settings(key, mode, auto_approve)
VALUES ('default', 'open', true) ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON public.device_approval_settings TO anon, authenticated;
GRANT ALL ON public.device_approval_settings TO service_role;
ALTER TABLE public.device_approval_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_approval_settings_read ON public.device_approval_settings;
CREATE POLICY device_approval_settings_read ON public.device_approval_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.device_approval_settings(p_mode text DEFAULT NULL, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF p_mode IS NOT NULL THEN
    PERFORM public._admin_guard();
    UPDATE public.device_approval_settings
       SET mode = p_mode, message = COALESCE(p_message, message),
           updated_by = auth.uid(), updated_at = now()
     WHERE key = 'default';
  END IF;
  SELECT to_jsonb(d) INTO v FROM public.device_approval_settings d WHERE d.key = 'default';
  RETURN COALESCE(v, '{}'::jsonb);
END; $$;

-- =====================================================================
-- PHẦN 5 — RPC QUYỀN ADMIN
-- =====================================================================

CREATE OR REPLACE FUNCTION public.my_admin_permissions()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT perm), '{}'::text[]) FROM (
    SELECT permission AS perm FROM public.admin_permissions WHERE user_id = auth.uid()
    UNION
    SELECT role FROM public.admin_role_assignments WHERE user_id = auth.uid() AND NOT suspended
    UNION
    SELECT role::text FROM public.user_roles WHERE user_id = auth.uid()
    UNION
    SELECT 'super_admin' WHERE public._is_super_admin(auth.uid())
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.my_approval_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mode text; v_status text;
BEGIN
  SELECT mode INTO v_mode FROM public.device_approval_settings WHERE key = 'default';
  SELECT status::text INTO v_status FROM public.bangchu WHERE auth_user_id = auth.uid();
  RETURN jsonb_build_object(
    'mode', COALESCE(v_mode, 'open'),
    'status', COALESCE(v_status, 'none'),
    'approved', COALESCE(v_status, 'none') IN ('approved', 'none'),
    'is_admin', public._is_current_admin()
  );
END; $$;

CREATE OR REPLACE FUNCTION public.approve_bangchu(_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  PERFORM public._super_guard();
  UPDATE public.bangchu
     SET status = 'approved', is_active = true, approved_by = auth.uid(), approved_at = now()
   WHERE id = _target OR auth_user_id = _target
  RETURNING auth_user_id INTO v_uid;

  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: không tìm thấy hồ sơ Bang Chủ'; END IF;

  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET is_admin = true, updated_at = now() WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'user_id', v_uid);
END; $$;

CREATE OR REPLACE FUNCTION public.reject_bangchu(_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  PERFORM public._super_guard();
  UPDATE public.bangchu
     SET status = 'rejected', is_active = false, approved_by = auth.uid(), approved_at = now()
   WHERE id = _target OR auth_user_id = _target
  RETURNING auth_user_id INTO v_uid;

  IF v_uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_uid AND role::text IN ('admin','super_admin','moderator');
    UPDATE public.profiles SET is_admin = false, updated_at = now() WHERE id = v_uid;
  END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id uuid, username text, full_name text, avatar text,
  permissions text[], roles text[], suspended boolean, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  RETURN QUERY
  WITH ids AS (
    SELECT DISTINCT x.user_id FROM (
      SELECT ap.user_id FROM public.admin_permissions ap
      UNION SELECT ara.user_id FROM public.admin_role_assignments ara
      UNION SELECT ur.user_id FROM public.user_roles ur WHERE ur.role::text IN ('admin','super_admin','moderator')
    ) x
  )
  SELECT p.id, p.username, p.full_name, COALESCE(p.avatar, p.avatar_url),
         COALESCE((SELECT array_agg(ap.permission) FROM public.admin_permissions ap WHERE ap.user_id = p.id), '{}'::text[]),
         COALESCE((SELECT array_agg(ara.role) FROM public.admin_role_assignments ara WHERE ara.user_id = p.id), '{}'::text[]),
         COALESCE((SELECT bool_and(ara.suspended) FROM public.admin_role_assignments ara WHERE ara.user_id = p.id), false),
         p.created_at
    FROM ids i JOIN public.profiles p ON p.id = i.user_id
   ORDER BY p.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.grant_admin_permission(_user_id uuid, _perm text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._super_guard();
  INSERT INTO public.admin_permissions(user_id, permission, granted_by)
  VALUES (_user_id, _perm, auth.uid())
  ON CONFLICT (user_id, permission) DO NOTHING;
  UPDATE public.profiles SET is_admin = true, updated_at = now() WHERE id = _user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_admin_permission(_user_id uuid, _perm text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._super_guard();
  DELETE FROM public.admin_permissions WHERE user_id = _user_id AND permission = _perm;
  IF NOT EXISTS (SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id)
     AND NOT EXISTS (SELECT 1 FROM public.admin_role_assignments WHERE user_id = _user_id AND NOT suspended) THEN
    UPDATE public.profiles SET is_admin = false, updated_at = now() WHERE id = _user_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_admin_role(_user_id uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._super_guard();
  INSERT INTO public.admin_role_assignments(user_id, role, assigned_by)
  VALUES (_user_id, _role, auth.uid())
  ON CONFLICT (user_id, role) DO UPDATE SET suspended = false;

  IF _role IN ('admin_1','super_admin') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  UPDATE public.profiles SET is_admin = true, updated_at = now() WHERE id = _user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_admin_role(_user_id uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._super_guard();
  DELETE FROM public.admin_role_assignments WHERE user_id = _user_id AND role = _role;
  IF NOT EXISTS (SELECT 1 FROM public.admin_role_assignments WHERE user_id = _user_id AND NOT suspended)
     AND NOT EXISTS (SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id) THEN
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role::text IN ('admin','moderator');
    UPDATE public.profiles SET is_admin = false, updated_at = now() WHERE id = _user_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.suspend_admin(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._super_guard();
  UPDATE public.admin_role_assignments SET suspended = true WHERE user_id = _user_id;
  UPDATE public.profiles SET is_admin = false, updated_at = now() WHERE id = _user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.restore_admin(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._super_guard();
  UPDATE public.admin_role_assignments SET suspended = false WHERE user_id = _user_id;
  UPDATE public.profiles SET is_admin = true, updated_at = now() WHERE id = _user_id;
END; $$;

-- =====================================================================
-- PHẦN 6 — RPC KIỂM DUYỆT & KHOÁ TÀI KHOẢN
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_add_keyword(_keyword text, _severity text DEFAULT 'medium', _penalty int DEFAULT 5)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM public._admin_guard();
  INSERT INTO public.banned_keywords(keyword, severity, penalty, created_by)
  VALUES (lower(btrim(_keyword)), COALESCE(_severity, 'medium'), GREATEST(COALESCE(_penalty, 5), 0), auth.uid())
  ON CONFLICT (keyword) DO UPDATE SET severity = EXCLUDED.severity, penalty = EXCLUDED.penalty
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_keyword(_id bigint, _penalty int DEFAULT NULL, _severity text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  UPDATE public.banned_keywords
     SET penalty  = COALESCE(_penalty, penalty),
         severity = COALESCE(_severity, severity)
   WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_keyword(_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  DELETE FROM public.banned_keywords WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_moderation_stats(_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public._admin_guard();
  SELECT jsonb_build_object(
    'days', COALESCE(_days, 30),
    'keywords', (SELECT count(*) FROM public.banned_keywords),
    'banned_users', (SELECT count(*) FROM public.profiles WHERE is_banned),
    'blocked_devices', (SELECT count(*) FROM public.blocked_devices),
    'blocked_ips', (SELECT count(*) FROM public.blocked_ips),
    'restrictions', (SELECT count(*) FROM public.user_restrictions
                      WHERE created_at >= now() - make_interval(days => COALESCE(_days, 30)))
  ) INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_unblock_user_devices(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d int := 0; i int := 0;
BEGIN
  PERFORM public._admin_guard();

  DELETE FROM public.blocked_devices WHERE user_id = p_user_id;
  GET DIAGNOSTICS d = ROW_COUNT;
  BEGIN
    DELETE FROM public.blocked_ips WHERE user_id = p_user_id;
    GET DIAGNOSTICS i = ROW_COUNT;
  EXCEPTION WHEN undefined_column THEN i := 0; END;

  DELETE FROM public.user_restrictions WHERE user_id = p_user_id;
  UPDATE public.profiles
     SET is_banned = false, banned_until = NULL, ban_level = 0,
         ban_reason = NULL, banned_at = NULL, status = 'active', updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'devices_unblocked', d, 'ips_unblocked', i);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_permanent_ban(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dev int := 0; v_phone int := 0;
BEGIN
  PERFORM public._admin_guard();

  UPDATE public.profiles
     SET is_banned = true, ban_level = 3, ban_reason = COALESCE(p_reason, 'Khoá vĩnh viễn'),
         banned_at = now(), banned_by = auth.uid(), banned_until = NULL,
         status = 'banned', updated_at = now()
   WHERE id = p_user_id;

  INSERT INTO public.user_restrictions(user_id, kind, level, reason, is_permanent, created_by)
  VALUES (p_user_id, 'ban', 3, COALESCE(p_reason, 'Khoá vĩnh viễn'), true, auth.uid());

  BEGIN
    INSERT INTO public.blocked_devices(device_id, user_id, reason, created_by)
    SELECT DISTINCT bd.device_id, p_user_id, 'permanent_ban', auth.uid()
      FROM public.blocked_devices bd WHERE bd.user_id = p_user_id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_dev = ROW_COUNT;
  EXCEPTION WHEN others THEN v_dev := 0; END;

  UPDATE public.phone_verifications SET blocked = true WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_phone = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'devices_blocked', v_dev, 'phone_blocked', v_phone);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_ban_member_level(
  p_user uuid, p_level int, p_reason text DEFAULT NULL, p_days int DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz;
BEGIN
  PERFORM public._admin_guard();
  IF COALESCE(p_level, 0) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'INVALID_LEVEL: cấp khoá 1-3'; END IF;

  v_until := CASE WHEN p_level >= 3 OR p_days IS NULL THEN NULL
                  ELSE now() + make_interval(days => p_days) END;

  UPDATE public.profiles
     SET is_banned = true, ban_level = p_level, ban_reason = p_reason,
         banned_at = now(), banned_by = auth.uid(), banned_until = v_until,
         status = 'banned', updated_at = now()
   WHERE id = p_user;

  INSERT INTO public.user_restrictions(user_id, kind, level, reason, expires_at, is_permanent, created_by)
  VALUES (p_user, 'ban', p_level, p_reason, v_until, v_until IS NULL, auth.uid());

  RETURN jsonb_build_object('ok', true, 'level', p_level, 'until', v_until);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_unban_member_full(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._admin_guard();
  PERFORM public.admin_unblock_user_devices(p_user);
  UPDATE public.phone_verifications SET blocked = false WHERE user_id = p_user;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_bulk_unlock(p_user_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; uid uuid;
BEGIN
  PERFORM public._admin_guard();
  FOREACH uid IN ARRAY COALESCE(p_user_ids, '{}'::uuid[]) LOOP
    PERFORM public.admin_unblock_user_devices(uid);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

-- =====================================================================
-- PHẦN 7 — CẤP QUYỀN GỌI RPC
-- =====================================================================
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'admin_list_internal_accounts','admin_update_internal_account','admin_set_internal_account_gem',
         'admin_set_internal_account_stats','admin_lock_internal_account','admin_bulk_lock_internal_accounts',
         'admin_delete_internal_account','admin_delete_internal_accounts','admin_purge_all_accounts',
         'admin_signup_account','admin_bulk_signup','admin_check_usernames','admin_internal_real_users',
         'admin_internal_send_red_packet','admin_internal_get_red_packet','admin_internal_open_red_packet',
         'secure_transfer_gem','transfer_balance','claim_transfer','daily_checkin',
         'create_withdrawal_request','review_withdrawal_request','list_withdrawal_requests',
         'admin_list_withdrawal_requests','my_withdrawal_requests',
         'my_admin_permissions','my_approval_status','approve_bangchu','reject_bangchu','list_admin_users',
         'grant_admin_permission','revoke_admin_permission','assign_admin_role','remove_admin_role',
         'suspend_admin','restore_admin','device_approval_settings',
         'admin_add_keyword','admin_update_keyword','admin_delete_keyword','admin_moderation_stats',
         'admin_unblock_user_devices','admin_permanent_ban','admin_ban_member_level',
         'admin_unban_member_full','admin_bulk_unlock'
       )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
-- =============================== HẾT =================================
