-- ============================================================================
-- RUN NOW trên Supabase #1 (core) — SQL Editor → Run
-- FIX: "operator does not exist: uuid = text" (code 42883) khi Admin Panel
--      mở trang Cá / Rút Cá (RPC admin_list_withdrawal_requests).
--
-- Nguyên nhân: một hàm đang chạy trên DB so sánh trực tiếp cột UUID
-- (auth.uid() / user_id / id) với giá trị TEXT (tham số tìm kiếm hoặc cột
-- user_roles.user_id kiểu text). Postgres không tự ép kiểu → 42883.
--
-- Cách sửa: định nghĩa lại toàn bộ chuỗi hàm với ÉP KIỂU TƯỜNG MINH (::text)
-- ở mọi phép so sánh liên quan UUID ↔ TEXT. Idempotent, không đụng dữ liệu.
-- ============================================================================

-- 1) Guard admin: mọi so sánh uuid/text đều ép ::text ở CẢ HAI vế.
create or replace function public._is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_admin = true
             or coalesce(p.role, '') in ('admin', 'super_admin', 'moderator')
        from public.profiles p
       where p.id::text = auth.uid()::text
    ),
    false
  )
  or exists (
    select 1
      from public.user_roles ur
     where ur.user_id::text = auth.uid()::text
       and ur.role::text in ('admin', 'super_admin', 'moderator')
  );
$$;

grant execute on function public._is_current_admin() to authenticated;

create or replace function public._admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public._is_current_admin() then
    raise exception 'FORBIDDEN: chỉ Admin mới được thực hiện thao tác này'
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function public._admin_guard() to authenticated;

-- 2) RPC danh sách yêu cầu rút — FAIL CLOSED, an toàn kiểu dữ liệu.
--    p_status là TEXT và chỉ so với cột status (text) → không bao giờ 42883.
create or replace function public.admin_list_withdrawal_requests(p_status text default null)
returns table (
  id uuid, code text, user_id uuid, amount bigint, fee bigint, net_amount bigint,
  bank_name text, bank_account text, account_holder text, status text,
  note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_guard();   -- KHÔNG bọc exception: thiếu quyền = từ chối

  return query
  select w.id, w.code, w.user_id, w.amount, w.fee, w.net_amount,
         w.bank_name, w.bank_account, w.account_holder, w.status,
         coalesce(w.note, w.admin_note) as note, w.reviewed_by,
         coalesce(w.reviewed_at, w.processed_at) as reviewed_at, w.created_at
    from public.withdrawal_requests w
   where (p_status is null or btrim(p_status) = '' or w.status = btrim(p_status))
   order by w.created_at desc
   limit 500;
end;
$$;

revoke all on function public.admin_list_withdrawal_requests(text) from public, anon;
grant execute on function public.admin_list_withdrawal_requests(text) to authenticated;
grant execute on function public.admin_list_withdrawal_requests(text) to service_role;

-- Alias giữ tương thích ngược nếu nơi khác còn gọi list_withdrawal_requests.
create or replace function public.list_withdrawal_requests(p_status text default null)
returns table (
  id uuid, code text, user_id uuid, amount bigint, fee bigint, net_amount bigint,
  bank_name text, bank_account text, account_holder text, status text,
  note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.admin_list_withdrawal_requests(p_status);
$$;

revoke all on function public.list_withdrawal_requests(text) from public, anon;
grant execute on function public.list_withdrawal_requests(text) to authenticated;
grant execute on function public.list_withdrawal_requests(text) to service_role;

-- 3) RPC duyệt / từ chối — ép ::text khi đối chiếu p_id / user_id.
create or replace function public.review_withdrawal_request(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_amount bigint;
  v_status text;
  v_code   text;
begin
  perform public._admin_guard();

  select w.user_id, w.amount, w.status, w.code
    into v_user, v_amount, v_status, v_code
    from public.withdrawal_requests w
   where w.id::text = p_id::text
   for update;

  if v_user is null then
    raise exception 'Không tìm thấy yêu cầu';
  end if;
  if v_status <> 'pending' then
    raise exception 'Yêu cầu đã được xử lý';
  end if;

  if p_approve then
    update public.withdrawal_requests w
       set status = 'approved', admin_note = p_note, processed_at = now()
     where w.id::text = p_id::text;
  else
    -- Từ chối = hoàn xu cho thành viên.
    update public.profiles p
       set gem_balance = coalesce(p.gem_balance, 0) + v_amount
     where p.id::text = v_user::text;
    update public.withdrawal_requests w
       set status = 'rejected', admin_note = p_note, processed_at = now()
     where w.id::text = p_id::text;
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'approved', p_approve);
end;
$$;

revoke all on function public.review_withdrawal_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_withdrawal_request(uuid, boolean, text) to authenticated;
grant execute on function public.review_withdrawal_request(uuid, boolean, text) to service_role;
