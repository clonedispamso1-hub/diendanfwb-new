-- =====================================================================
-- RUN ON SUPABASE #1 — Tài khoản thứ hai (Clone) chuyển Xu cho người dùng.
-- Cùng logic an toàn như secure_transfer_gem (khoá dòng, kiểm số dư,
-- ghi gem_transactions), nhưng người gửi là Clone do Admin điều khiển.
--  - Chỉ Admin (profiles.is_admin hoặc user_roles admin/super_admin) được gọi.
--  - p_clone_id bắt buộc là account_source = 'internal'.
--  - p_request_id chống trùng: cùng request_id chỉ ghi nhận 1 lần.
-- Không đổi bảng, không đổi RLS, không đổi secure_transfer_gem.
-- =====================================================================

create or replace function public.admin_clone_transfer_gem(
  p_clone_id uuid,
  p_receiver_id uuid,
  p_amount bigint,
  p_note text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_is_admin boolean := false;
  v_src text;
  v_sender_balance bigint;
  v_receiver_balance bigint;
  v_sender_new bigint;
  v_receiver_new bigint;
  v_tx_id uuid;
  v_note text;
begin
  if v_admin is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  end if;

  select coalesce(is_admin, false) into v_is_admin from public.profiles where id = v_admin;
  if not coalesce(v_is_admin, false) and to_regclass('public.user_roles') is not null then
    execute $q$ select exists (select 1 from public.user_roles r
      where r.user_id = $1 and r.role::text in ('admin','super_admin')) $q$
      into v_is_admin using v_admin;
  end if;
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền');
  end if;

  select account_source into v_src from public.profiles where id = p_clone_id;
  if v_src is distinct from 'internal' then
    return jsonb_build_object('ok', false, 'code', 'NOT_CLONE', 'message', 'Tài khoản gửi không phải tài khoản thứ hai');
  end if;
  if p_receiver_id is null or p_receiver_id = p_clone_id then
    return jsonb_build_object('ok', false, 'code', 'INVALID_RECIPIENT', 'message', 'Người nhận không hợp lệ');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Xu không hợp lệ');
  end if;

  -- Tuần tự hoá mọi lần chuyển của cùng 1 clone → chống bấm đúp.
  perform pg_advisory_xact_lock(hashtext('clone_transfer:' || p_clone_id::text));

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if p_request_id is not null and length(p_request_id) between 8 and 64 then
    begin
      select id into v_tx_id from public.gem_transactions
       where from_id = p_clone_id and note like '%#req:' || p_request_id limit 1;
      if v_tx_id is not null then
        return jsonb_build_object('ok', true, 'duplicate', true, 'tx_id', v_tx_id, 'amount', p_amount);
      end if;
    exception when undefined_table or undefined_column then null;
    end;
    v_note := coalesce(v_note || ' ', '') || '#req:' || p_request_id;
  end if;

  perform set_config('app.allow_gem_change', '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  select coalesce(gem_balance, 0) into v_sender_balance from public.profiles where id = p_clone_id for update;
  if v_sender_balance < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Tài khoản không đủ Xu');
  end if;
  select coalesce(gem_balance, 0) into v_receiver_balance from public.profiles where id = p_receiver_id for update;
  if v_receiver_balance is null then
    return jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND', 'message', 'Không tìm thấy người nhận');
  end if;

  update public.profiles set gem_balance = v_sender_balance - p_amount
   where id = p_clone_id returning gem_balance into v_sender_new;
  update public.profiles set gem_balance = v_receiver_balance + p_amount
   where id = p_receiver_id returning gem_balance into v_receiver_new;

  begin
    insert into public.gem_transactions(from_id, to_id, amount, note, action_type, status, created_at)
    values (p_clone_id, p_receiver_id, p_amount, v_note, 'transfer', 'completed', now())
    returning id into v_tx_id;
  exception when undefined_table or undefined_column then v_tx_id := null;
  end;

  return jsonb_build_object(
    'ok', true, 'tx_id', v_tx_id, 'amount', p_amount,
    'new_balance', v_sender_new, 'sender_new_balance', v_sender_new,
    'receiver_new_balance', v_receiver_new
  );
end;
$$;

revoke all on function public.admin_clone_transfer_gem(uuid, uuid, bigint, text, text) from public, anon;
grant execute on function public.admin_clone_transfer_gem(uuid, uuid, bigint, text, text) to authenticated;
