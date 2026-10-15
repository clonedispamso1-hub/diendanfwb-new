-- =====================================================================
-- CHẠY TRÊN SUPABASE 1, SAU file RUN_NOW_2026-10-15_free_posts_and_post_fee.sql.
-- An toàn chạy lại. KHÔNG xoá/sửa dữ liệu cũ, KHÔNG tạo giao dịch, KHÔNG đổi số dư.
--
-- Sửa: lượt/tiền đã trừ nhưng bài chưa tạo được giờ được dùng lại BẤT KỂ bao lâu
-- (trước đây quá 23 giờ thì vé bị bỏ quên → mất lượt / mất 5.000).
-- Vé (chuỗi ký) vẫn hết hạn sau 24 giờ; mỗi lần lấy lại sẽ ký vé mới cho cùng
-- một lượt đã trả. Supabase 3 bảo đảm mỗi lượt chỉ tạo được đúng 1 bài.
-- =====================================================================

create or replace function public.reserve_post_slot(p_confirm_paid boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prof record;
  v_open record;
  v_free integer;
  v_id uuid;
  c_price constant bigint := 5000;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', 'Chưa đăng nhập');
  end if;

  select * into v_prof from public.profiles where id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', 'Không tìm thấy tài khoản');
  end if;

  if coalesce((to_jsonb(v_prof)->>'is_admin')::boolean, false) then
    return jsonb_build_object('ok', true, 'kind', 'exempt', 'charge_id', null,
      'ticket', private.sign_post_ticket(gen_random_uuid(), v_uid, 'exempt'));
  end if;

  -- Lượt đã trả nhưng chưa thành bài → ký lại vé mới, KHÔNG trừ lần nữa (không giới hạn tuổi).
  select id, kind into v_open from public.post_charges
   where user_id = v_uid and status = 'reserved'
   order by created_at asc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'kind', v_open.kind, 'charge_id', v_open.id, 'reused', true,
      'ticket', private.sign_post_ticket(v_open.id, v_uid, v_open.kind));
  end if;

  insert into public.post_quota(user_id, free_remaining, free_granted)
  values (v_uid, 0, false) on conflict (user_id) do nothing;
  select free_remaining into v_free from public.post_quota where user_id = v_uid for update;

  if v_free > 0 then
    update public.post_quota set free_remaining = free_remaining - 1, updated_at = now()
     where user_id = v_uid;
    insert into public.post_charges(user_id, kind, amount) values (v_uid, 'free', 0)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'kind', 'free', 'charge_id', v_id,
      'free_remaining', v_free - 1, 'ticket', private.sign_post_ticket(v_id, v_uid, 'free'));
  end if;

  if not coalesce(p_confirm_paid, false) then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED', 'price', c_price,
                              'balance', coalesce(v_prof.gem_balance, 0));
  end if;

  if coalesce(v_prof.gem_balance, 0) < c_price then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT', 'price', c_price,
                              'balance', coalesce(v_prof.gem_balance, 0),
                              'message', 'Số dư ví không đủ');
  end if;

  update public.profiles set gem_balance = gem_balance - c_price where id = v_uid;
  update public.post_quota set paid_posts = paid_posts + 1, updated_at = now() where user_id = v_uid;
  insert into public.post_charges(user_id, kind, amount) values (v_uid, 'paid', c_price)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'kind', 'paid', 'charge_id', v_id, 'price', c_price,
    'balance', coalesce(v_prof.gem_balance, 0) - c_price,
    'ticket', private.sign_post_ticket(v_id, v_uid, 'paid'));
end; $$;

revoke all on function public.reserve_post_slot(boolean) from public, anon;
grant execute on function public.reserve_post_slot(boolean) to authenticated;
