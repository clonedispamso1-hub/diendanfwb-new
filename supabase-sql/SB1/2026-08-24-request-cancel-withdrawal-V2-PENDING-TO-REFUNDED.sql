-- RUN ON SUPABASE #1 ONLY — CHỜ DUYỆT, CHƯA CHẠY
-- =============================================================================
-- 2026-08-24 (V2) — Thành viên tự HỦY đơn rút tiền đang chờ duyệt.
--
-- RÀNG BUỘC ĐÃ TUÂN THỦ:
--   * Chỉ dùng status hiện có: pending | approved | rejected | refunded
--     -> Hủy = chuyển 'pending' -> 'refunded' (giống expire_pending_withdrawals).
--   * KHÔNG tạo 'cancel_requested'. KHÔNG DROP / ALTER constraint status.
--   * KHÔNG tạo bảng mới. KHÔNG đổi logic tài chính (hoàn đúng w.amount).
--   * Hoàn xu ĐÚNG 1 LẦN, atomic + idempotent:
--       UPDATE ... WHERE status = 'pending' RETURNING  -> chỉ 1 transaction
--       thắng được row; các lần gọi sau không còn 'pending' nên không hoàn nữa.
--   * SB1 không ghi public.notifications (bảng ở SB#3).
--
-- File cũ supabase-sql/SB1/2026-08-24-request-cancel-withdrawal.sql KHÔNG chạy
-- (nó dùng status 'cancel_requested' / 'cancelled' — vi phạm constraint DB1).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- request_cancel_withdrawal(p_request_id uuid)
-- Chỉ chủ đơn mới hủy được, chỉ khi đơn còn 'pending'.
-- Trả jsonb { ok, code, message, amount }.
-- -----------------------------------------------------------------------------
create or replace function public.request_cancel_withdrawal(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_status text;
  v_amount bigint;
  v_code   text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED',
                              'message', 'Bạn cần đăng nhập.');
  end if;

  -- Kiểm tra quyền sở hữu trước (không khoá row nếu không phải của mình).
  select w.user_id, w.status
    into v_owner, v_status
    from public.withdrawal_requests w
   where w.id = p_request_id;

  if v_owner is null or v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND',
                              'message', 'Không tìm thấy yêu cầu rút tiền của bạn.');
  end if;

  -- ATOMIC + IDEMPOTENT: chỉ đúng một lệnh UPDATE này chiếm được row 'pending'.
  update public.withdrawal_requests w
     set status       = 'refunded',
         note         = coalesce(w.note, 'Thành viên tự hủy — đã hoàn xu'),
         admin_note   = coalesce(w.admin_note, 'Thành viên tự hủy — đã hoàn xu'),
         processed_at = now(),
         reviewed_at  = coalesce(w.reviewed_at, now())
   where w.id = p_request_id
     and w.user_id = v_uid
     and w.status = 'pending'
  returning w.amount, w.code into v_amount, v_code;

  if v_amount is null then
    -- Không còn 'pending': đã hủy/duyệt/từ chối trước đó -> KHÔNG hoàn thêm.
    if v_status = 'refunded' then
      return jsonb_build_object('ok', true, 'code', 'ALREADY_REFUNDED',
                                'message', 'Đơn đã được hủy và hoàn xu trước đó.');
    end if;
    return jsonb_build_object('ok', false, 'code', 'NOT_PENDING',
                              'message', 'Đơn đã được xử lý, không thể hủy.');
  end if;

  -- Hoàn đúng số xu đã trừ khi tạo đơn (giống expire_pending_withdrawals).
  update public.profiles p
     set gem_balance = coalesce(p.gem_balance, 0) + v_amount
   where p.id = v_uid;

  return jsonb_build_object('ok', true, 'code', 'REFUNDED',
                            'message', 'Đã hủy đơn và hoàn xu về ví.',
                            'request_code', v_code,
                            'amount', v_amount);
end;
$$;

revoke all on function public.request_cancel_withdrawal(uuid) from public, anon;
grant execute on function public.request_cancel_withdrawal(uuid) to authenticated;
grant execute on function public.request_cancel_withdrawal(uuid) to service_role;

commit;

-- =============================================================================
-- DỌN DẸP TUỲ CHỌN — chỉ chạy nếu bản draft cũ đã từng được apply:
--   drop function if exists public.request_cancel_withdrawal(p_id uuid);
--   drop function if exists public.finalize_cancelled_withdrawals();
-- =============================================================================
