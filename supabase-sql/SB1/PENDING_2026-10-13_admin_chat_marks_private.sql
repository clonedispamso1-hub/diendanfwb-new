-- =====================================================================
-- SUPABASE #1 — Lưu RIÊNG TƯ dấu quản trị khu "Tài khoản thứ hai → Tin nhắn".
-- CHƯA CHẠY. Chỉ chạy sau khi chủ dự án duyệt, và NÊN chạy SAU bản vá
-- bangchu_self_insert (nếu chưa vá, người dùng thường có thể tự thành admin).
--
-- Chỉ tạo 1 bảng mới (lịch sử dùng Kịch bản) + 1 hàm kiểm tra quyền. KHÔNG đụng bảng messages (#3),
-- KHÔNG đổi RLS của bảng nào khác. Chạy lại nhiều lần không sao.
-- =====================================================================
begin;

-- Quyền = đúng điều kiện vào Admin Panel: bangchu approved + active.
create or replace function public.admin_chat_marks_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bangchu
    where auth_user_id = auth.uid() and status = 'approved' and is_active = true
  );
$$;
revoke all on function public.admin_chat_marks_is_admin() from public, anon;
grant execute on function public.admin_chat_marks_is_admin() to authenticated;

-- 1) Lịch sử dùng Kịch bản: 1 dòng / (người nhận, kịch bản, tài khoản thứ hai).
create table if not exists public.admin_chat_script_usage (
  id               uuid primary key default gen_random_uuid(),
  peer_id          uuid not null,
  script_id        text not null,
  script_name      text not null,
  account_id       uuid not null,
  account_username text,
  used_by          uuid default auth.uid(),
  used_at          timestamptz not null default now(),
  unique (peer_id, script_id, account_id)
);
create index if not exists admin_chat_script_usage_peer_idx on public.admin_chat_script_usage(peer_id);

-- Không cấp gì cho anon.
revoke all on public.admin_chat_script_usage   from anon;
grant select, insert, update, delete on public.admin_chat_script_usage   to authenticated;
grant all on public.admin_chat_script_usage   to service_role;

alter table public.admin_chat_script_usage   enable row level security;

drop policy if exists admin_only_all on public.admin_chat_script_usage;
create policy admin_only_all on public.admin_chat_script_usage
  for all to authenticated
  using (public.admin_chat_marks_is_admin())
  with check (public.admin_chat_marks_is_admin());

-- 2) Chuyển dữ liệu lịch sử kịch bản tạm đang nằm trong kho cài đặt công khai rồi xoá khỏi đó.
insert into public.admin_chat_script_usage
  (peer_id, script_id, script_name, account_id, account_username, used_at)
select (u->>'peer_id')::uuid, u->>'script_id', coalesce(u->>'script_name','Kịch bản'),
       (u->>'account_id')::uuid, u->>'account_username',
       coalesce(nullif(u->>'at','')::timestamptz, now())
from public.admin_site_settings s, jsonb_array_elements(s.value) as u
where s.key = 'admin_chat_script_usage' and jsonb_typeof(s.value) = 'array'
  and (u->>'peer_id') ~* '^[0-9a-f-]{36}$' and (u->>'account_id') ~* '^[0-9a-f-]{36}$'
on conflict (peer_id, script_id, account_id) do nothing;

delete from public.admin_site_settings
where key = 'admin_chat_script_usage';

commit;

-- Khôi phục (gỡ hoàn toàn):
--   drop table if exists public.admin_chat_script_usage;
--   drop function if exists public.admin_chat_marks_is_admin();
