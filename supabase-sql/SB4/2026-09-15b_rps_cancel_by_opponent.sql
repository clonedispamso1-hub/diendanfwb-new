-- ---------------------------------------------------------------------
-- SUPABASE #4 (ybzdpxwbpbkeqkqwbscp) — bản vá nhỏ cho KÉO • BÚA • BAO
--
-- Cho phép NGƯỜI ĐƯỢC MỜI bấm "Hủy" để từ chối lời mời
-- (trước đây chỉ người gửi mới huỷ được → báo lỗi NOT_OWNER).
--
-- KHÔNG tạo bảng mới, KHÔNG đụng dữ liệu cũ, KHÔNG trừ/khoá Xu.
-- Chạy trong SQL Editor của Supabase #4.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rps4_cancel_challenge(p_id uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rps_challenges%rowtype;
BEGIN
  SELECT * INTO r FROM public.rps_challenges WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  -- Cả người gửi (huỷ) lẫn người nhận (từ chối) đều được phép.
  IF p_user <> r.challenger_id AND p_user <> r.opponent_id THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF r.status <> 'pending' THEN RETURN; END IF;
  UPDATE public.rps_challenges
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = r.id;
END $$;

GRANT EXECUTE ON FUNCTION public.rps4_cancel_challenge(uuid, uuid)
  TO service_role, anon, authenticated;
