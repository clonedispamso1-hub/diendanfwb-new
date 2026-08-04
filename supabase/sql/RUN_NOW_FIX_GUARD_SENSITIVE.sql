-- =====================================================================
-- ⚡ CHẠY FILE NÀY TRONG SUPABASE SQL EDITOR (project zbuwddjcqdlyijcunwgd)
-- Mục đích: Sửa function profiles_guard_sensitive_columns() để honor
-- flag `app.allow_gem_change = '1'` mà RPC V3 đang bật.
--
-- Sau khi chạy:
--   - Frontend update gem_balance vẫn bị CHẶN (flag không bật).
--   - RPC gift_gem_to_post_v3 / claim_gift_gem_v3 (SECURITY DEFINER) ĐƯỢC PHÉP.
--   - Không cần quyền admin.
--   - Người nhận vẫn phải bấm Nhận mới được cộng Gem.
--
-- An toàn để chạy lại nhiều lần (idempotent).
-- =====================================================================

-- B1. Xem source gốc (chạy riêng nếu muốn kiểm tra trước khi REPLACE):
--   SELECT pg_get_functiondef('public.profiles_guard_sensitive_columns()'::regprocedure);

-- B2. REPLACE function — chèn bypass flag NGAY ĐẦU function.
--     Logic check các cột nhạy cảm còn lại được giữ nguyên: chỉ chặn khi
--     không phải service_role VÀ flag không bật.
CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $T$
DECLARE
  v_allow_gem    text;
  v_allow_candy  text;
  v_role         text;
BEGIN
  -- ---------- BYPASS 1: RPC nội bộ đã bật flag ----------
  BEGIN
    v_allow_gem := current_setting('app.allow_gem_change', true);
  EXCEPTION WHEN OTHERS THEN v_allow_gem := NULL; END;

  BEGIN
    v_allow_candy := current_setting('app.allow_candy_change', true);
  EXCEPTION WHEN OTHERS THEN v_allow_candy := NULL; END;

  IF COALESCE(v_allow_gem, '') = '1' OR COALESCE(v_allow_candy, '') = '1' THEN
    RETURN NEW;
  END IF;

  -- ---------- BYPASS 2: service_role (edge functions / admin client) ----------
  BEGIN
    v_role := auth.role();
  EXCEPTION WHEN OTHERS THEN v_role := NULL; END;

  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- ---------- Chặn sửa các cột nhạy cảm từ client ----------
  IF NEW.gem_balance IS DISTINCT FROM OLD.gem_balance THEN
    RAISE EXCEPTION 'Không được phép sửa gem_balance từ client'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_TABLE_NAME = 'profiles'
     AND (to_jsonb(NEW) ? 'candy_balance')
     AND (NEW.candy_balance IS DISTINCT FROM OLD.candy_balance) THEN
    RAISE EXCEPTION 'Không được phép sửa candy_balance từ client'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$T$;

-- B3. (Không cần DROP/CREATE TRIGGER — trigger profiles_guard_sensitive vẫn trỏ
--     vào cùng tên function nên CREATE OR REPLACE là đủ.)

-- B4. Kiểm tra lại:
--   SELECT proname, prosrc FROM pg_proc
--    WHERE proname = 'profiles_guard_sensitive_columns';