-- =====================================================================
-- CHẠY TRÊN SUPABASE 1 (core), SAU các file 2026-10-15 / 10-16 / 10-17.
-- 20 lượt đăng bài miễn phí cho MỌI tài khoản (mới + cũ), hết lượt → 5.000 gem/bài.
-- An toàn chạy lại nhiều lần: bước nâng lên 20 chỉ chạy 1 lần / tài khoản
-- (cờ free_v20), KHÔNG cộng lại khi đăng nhập / tải lại trang.
-- KHÔNG đụng bài viết, KHÔNG đổi số dư gem, KHÔNG đổi vé "internal"
-- của Tài khoản thứ hai (reserve_internal_post_ticket giữ nguyên).
-- =====================================================================

alter table public.post_quota add column if not exists free_v20 boolean not null default false;
alter table public.post_quota add column if not exists free_celebrated_at timestamptz;

-- 1) Tài khoản mới → 20 lượt (một lần duy nhất).
create or replace function public.grant_new_user_free_posts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.post_quota(user_id, free_remaining, free_granted, free_v20)
  values (NEW.id, 20, true, true)
  on conflict (user_id) do nothing;
  return NEW;
exception when others then
  raise warning 'grant_new_user_free_posts failed for %: %', NEW.id, sqlerrm;
  return NEW;
end; $$;

-- 2) Tài khoản cũ: tổng 20 lượt = 20 − số lượt miễn phí đã dùng/đã giữ. Chỉ 1 lần.
insert into public.post_quota(user_id, free_remaining, free_granted, free_v20)
select p.id, 0, false, false from public.profiles p
on conflict (user_id) do nothing;

update public.post_quota q
   set free_remaining = greatest(0, 20 - coalesce((
         select count(*) from public.post_charges c
          where c.user_id = q.user_id and c.kind = 'free'), 0))::int,
       free_granted = true,
       free_v20 = true,
       updated_at = now()
 where q.free_v20 = false;

-- 3) reserve_post_slot: giữ nguyên logic, chỉ đổi dòng dự phòng khi thiếu bản ghi
--    quota → cấp 20 lượt (thay vì 0) để không user nào bị thiếu lượt.
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

  insert into public.post_quota(user_id, free_remaining, free_granted, free_v20)
  values (v_uid, 20, true, true) on conflict (user_id) do nothing;
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

-- 4) Hiệu ứng "+1 … +20": chỉ trả show=true ĐÚNG 1 LẦN / tài khoản.
--    Không cấp lượt — chỉ đọc số lượt thật. Admin / Tài khoản thứ hai: không hiện.
create or replace function public.claim_free_posts_celebration()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prof record;
  v_row record;
begin
  if v_uid is null then return jsonb_build_object('show', false); end if;
  select is_admin, account_source into v_prof from public.profiles where id = v_uid;
  if not found or coalesce(v_prof.is_admin, false)
     or coalesce(v_prof.account_source, '') = 'internal' then
    return jsonb_build_object('show', false);
  end if;
  update public.post_quota set free_celebrated_at = now()
   where user_id = v_uid and free_celebrated_at is null
   returning free_remaining into v_row;
  if not found then
    return jsonb_build_object('show', false,
      'free_remaining', (select free_remaining from public.post_quota where user_id = v_uid));
  end if;
  return jsonb_build_object('show', true, 'total', 20, 'free_remaining', v_row.free_remaining);
end; $$;
revoke all on function public.claim_free_posts_celebration() from public, anon;
grant execute on function public.claim_free_posts_celebration() to authenticated;

-- Kiểm tra nhanh (chỉ đọc)
select count(*) filter (where free_v20) as da_nang_20, count(*) as tong from public.post_quota;
