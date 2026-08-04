-- ============================================================
-- FIX: lỗi "candy can only be changed via transfer_gem_secure()"
-- khi user hợp lệ gọi RPC chuyển Gem.
--
-- Nguyên nhân: trigger profiles_block_privileged_columns dùng
-- auth.role() — luôn trả 'authenticated' kể cả khi RPC chạy với
-- SECURITY DEFINER, nên trigger chặn chính RPC tin cậy.
--
-- Hướng fix:
--   - Trigger cho phép update candy khi session flag
--     `app.allow_candy_change = '1'`.
--   - RPC transfer_gem_secure tự `set_config(..., true)` flag này
--     trong transaction nội bộ → không rò rỉ ra ngoài, user thường
--     vẫn KHÔNG thể tự sửa candy / is_admin / is_vip / role.
--
-- Chạy file này một lần trên DB production:
--   psql "$SUPABASE_DB_URL" -f supabase/sql/20260601_fix_candy_guard_and_transfer.sql
-- (hoặc dán vào SQL editor của Supabase).
-- ============================================================

create or replace function public.profiles_block_privileged_columns()
returns trigger
language plpgsql
as $T$
declare
  v_allow_candy text;
begin
  begin
    v_allow_candy := current_setting('app.allow_candy_change', true);
  exception when others then
    v_allow_candy := null;
  end;

  if auth.role() <> 'service_role'
     and not public.has_role(auth.uid(), 'admin') then

    if to_jsonb(NEW) ? 'candy'
       and (to_jsonb(NEW)->>'candy') is distinct from (to_jsonb(OLD)->>'candy')
       and coalesce(v_allow_candy,'') <> '1' then
      raise exception 'Giao dịch không thể thực hiện. Vui lòng thử lại.'
        using errcode = 'P0001';
    end if;

    if to_jsonb(NEW) ? 'is_admin'
       and (to_jsonb(NEW)->>'is_admin') is distinct from (to_jsonb(OLD)->>'is_admin') then
      raise exception 'is_admin is read-only';
    end if;
    if to_jsonb(NEW) ? 'is_vip'
       and (to_jsonb(NEW)->>'is_vip') is distinct from (to_jsonb(OLD)->>'is_vip') then
      raise exception 'is_vip is read-only';
    end if;
    if to_jsonb(NEW) ? 'role'
       and (to_jsonb(NEW)->>'role') is distinct from (to_jsonb(OLD)->>'role') then
      raise exception 'role is read-only';
    end if;
  end if;

  return NEW;
end;
$T$;

create or replace function public.transfer_gem_secure(
  p_to uuid,
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid := auth.uid();
  v_last timestamptz;
  v_balance bigint;
  v_tx_id uuid;
begin
  if v_from is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_to is null or p_to = v_from then raise exception 'INVALID_RECIPIENT'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  -- Bật flag bypass candy-guard chỉ trong transaction này
  perform set_config('app.allow_candy_change', '1', true);

  select last_transfer_at into v_last
    from public.gem_transfer_cooldown where user_id = v_from;
  if v_last is not null and now() - v_last < interval '30 seconds' then
    raise exception 'COOLDOWN: %', extract(epoch from (interval '30 seconds' - (now() - v_last)))::int;
  end if;

  select candy into v_balance from public.profiles where id = v_from for update;
  if v_balance is null or v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.profiles set candy = candy - p_amount where id = v_from;
  update public.profiles set candy = coalesce(candy,0) + p_amount where id = p_to;

  insert into public.gem_transactions(from_id, to_id, amount, note, action_type)
    values (v_from, p_to, p_amount, p_note, 'transfer')
    returning id into v_tx_id;

  insert into public.activity_logs(user_id, action_type, target_id, metadata)
    values
      (v_from, 'gem_send',    p_to,   jsonb_build_object('amount', p_amount, 'note', p_note, 'tx', v_tx_id)),
      (p_to,   'gem_receive', v_from, jsonb_build_object('amount', p_amount, 'note', p_note, 'tx', v_tx_id));

  insert into public.gem_transfer_cooldown(user_id, last_transfer_at)
    values (v_from, now())
    on conflict (user_id) do update set last_transfer_at = excluded.last_transfer_at;

  return jsonb_build_object('ok', true, 'tx_id', v_tx_id);
end;
$$;

grant execute on function public.transfer_gem_secure(uuid, bigint, text) to authenticated;
