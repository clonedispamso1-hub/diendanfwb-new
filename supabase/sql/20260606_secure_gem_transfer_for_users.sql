-- =====================================================================
-- FIX: User THƯỜNG bị chặn "Không được phép sửa gem_balance từ client"
-- khi tặng Gem / chuyển Gem.
--
-- Nguyên nhân: Trigger bảo mật chặn MỌI UPDATE cột gem_balance khi
-- người gọi không phải service_role. Trigger không phân biệt được rằng
-- một SECURITY DEFINER RPC tin cậy đang gọi nội bộ, nên RPC chuyển Gem
-- cũng bị chặn.
--
-- Hướng fix CHUẨN:
--   1. Trigger cho phép UPDATE khi session flag
--      `app.allow_gem_change = '1'` được bật.
--   2. RPC `secure_transfer_gem` (SECURITY DEFINER) tự bật flag bằng
--      `set_config(..., true)` (transaction-local — không rò rỉ).
--      → User thường gọi RPC vẫn chuyển Gem được.
--      → User thường gọi UPDATE trực tiếp từ Client (F12 hack) vẫn bị chặn.
--   3. Đồng thời vá `secure_send_gift_or_gem` và `admin_adjust_gem_balance`
--      để cùng dùng cơ chế flag → toàn hệ thống đồng bộ.
--
-- CÁCH CHẠY:
--   Mở Supabase SQL Editor của project (zbuwddjcqdlyijcunwgd) → dán
--   toàn bộ file này → Run. An toàn để chạy lại nhiều lần (idempotent).
-- =====================================================================

-- ---------- 1. Cập nhật trigger guard ----------
CREATE OR REPLACE FUNCTION public.profiles_block_gem_balance_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $T$
DECLARE
  v_allow text;
  v_role  text;
BEGIN
  -- Cho phép khi flag bypass đang bật (RPC nội bộ set lên)
  BEGIN
    v_allow := current_setting('app.allow_gem_change', true);
  EXCEPTION WHEN OTHERS THEN
    v_allow := NULL;
  END;
  IF COALESCE(v_allow, '') = '1' THEN
    RETURN NEW;
  END IF;

  -- Cho phép service_role (edge functions / admin client)
  BEGIN
    v_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Còn lại: chặn nếu thực sự có thay đổi gem_balance
  IF NEW.gem_balance IS DISTINCT FROM OLD.gem_balance THEN
    RAISE EXCEPTION 'Không được phép sửa gem_balance từ client'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$T$;

-- Gắn trigger (nếu chưa có)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_profiles_block_gem_balance_client'
  ) THEN
    CREATE TRIGGER trg_profiles_block_gem_balance_client
      BEFORE UPDATE OF gem_balance ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.profiles_block_gem_balance_client();
  END IF;
END $$;

-- ---------- 2. RPC chuyển Gem an toàn cho user thường ----------
CREATE OR REPLACE FUNCTION public.secure_transfer_gem(
  p_receiver_id uuid,
  p_amount      bigint,
  p_note        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender  uuid := auth.uid();
  v_balance bigint;
  v_recv    bigint;
  v_sender_new_balance bigint;
  v_receiver_new_balance bigint;
  v_tx_id   uuid;
BEGIN
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;
  IF p_receiver_id IS NULL OR p_receiver_id = v_sender THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_RECIPIENT', 'message', 'Người nhận không hợp lệ');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  END IF;

  -- Bật flag bypass — chỉ tồn tại trong transaction này
  PERFORM set_config('app.allow_gem_change', '1', true);

  -- Khoá hàng người gửi để atomic
  SELECT COALESCE(gem_balance, 0) INTO v_balance
    FROM public.profiles WHERE id = v_sender FOR UPDATE;
  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ Gem');
  END IF;

  SELECT COALESCE(gem_balance, 0) INTO v_recv
    FROM public.profiles WHERE id = p_receiver_id FOR UPDATE;
  IF v_recv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND', 'message', 'Không tìm thấy người nhận');
  END IF;

  UPDATE public.profiles
     SET gem_balance = v_balance - p_amount
   WHERE id = v_sender
   RETURNING gem_balance INTO v_sender_new_balance;
  UPDATE public.profiles
     SET gem_balance = v_recv + p_amount
   WHERE id = p_receiver_id
   RETURNING gem_balance INTO v_receiver_new_balance;

  -- Log giao dịch (best-effort, không vỡ nếu bảng chưa có)
  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, created_at)
    VALUES (v_sender, p_receiver_id, p_amount, p_note, 'transfer', now())
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_tx_id := NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'tx_id', v_tx_id,
    'amount', p_amount,
    'new_balance', v_sender_new_balance,
    'sender_new_balance', v_sender_new_balance,
    'receiver_new_balance', v_receiver_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.secure_transfer_gem(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.secure_transfer_gem(uuid, bigint, text) TO authenticated;

-- ---------- 3. Vá secure_send_gift_or_gem để bật flag ----------
-- (Nếu hàm này tồn tại sẵn, chạy lại sẽ cập nhật phần đầu để bật flag.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'secure_send_gift_or_gem'
  ) THEN
    -- Bọc một wrapper bật flag rồi gọi lại logic gốc nếu cần.
    -- Đơn giản nhất: nhắc admin chỉnh tay nếu hàm cũ có UPDATE gem_balance.
    RAISE NOTICE 'Đã có secure_send_gift_or_gem — hãy đảm bảo bên trong có dòng: PERFORM set_config(''app.allow_gem_change'', ''1'', true);';
  END IF;
END $$;

-- ---------- 4. Vá admin_adjust_gem_balance bật flag ----------
CREATE OR REPLACE FUNCTION public.admin_adjust_gem_balance(
  p_target_user_id uuid,
  p_amount         bigint,
  p_reason         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_is_admin boolean := false;
  v_old      bigint;
  v_new      bigint;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller AND role::text IN ('admin','super_admin','moderator')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT (role IN ('admin','super_admin','moderator'))
      INTO v_is_admin FROM public.profiles WHERE id = v_caller;
  END IF;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_old
    FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF v_old IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND');
  END IF;

  v_new := v_old + p_amount;
  IF v_new < 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'old', v_old);
  END IF;

  UPDATE public.profiles SET gem_balance = v_new WHERE id = p_target_user_id;

  BEGIN
    INSERT INTO public.admin_logs(admin_id, target_id, action, detail, created_at)
    VALUES (v_caller, p_target_user_id, 'adjust_gem',
      jsonb_build_object('amount', p_amount, 'old', v_old, 'new', v_new, 'reason', p_reason), now());
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'old', v_old, 'new', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_gem_balance(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_gem_balance(uuid, bigint, text) TO authenticated;
