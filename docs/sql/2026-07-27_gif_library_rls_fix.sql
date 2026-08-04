-- =============================================================================
-- FIX: RLS insert on public.gif_library luôn báo
--   "new row violates row-level security policy for table gif_library"
--
-- NGUYÊN NHÂN GỐC:
--   Migration cũ (docs/sql/2026-07-26_gif_library.sql) dùng
--     WITH CHECK (public.has_role(auth.uid(), 'admin'))
--   Nhưng toàn bộ ứng dụng KHÔNG dùng user_roles / has_role() để xác định
--   admin. Client (auth-provider.tsx) đọc `profile.is_admin` boolean trên
--   bảng `public.profiles`. Vì vậy:
--     - Nếu has_role() không tồn tại  → policy fail cứng.
--     - Nếu has_role() tồn tại nhưng user_roles rỗng → cũng fail.
--   Kết quả: admin thật (profile.is_admin = true) vẫn bị RLS chặn insert.
--
-- CÁCH SỬA:
--   Tạo hàm SECURITY DEFINER `public.is_platform_admin(uuid)` đọc
--   `profiles.is_admin` — khớp đúng với nguồn sự thật mà app đang dùng.
--   Rồi viết lại policy INSERT/UPDATE/DELETE trên gif_library dùng hàm này.
--   KHÔNG dùng service_role, KHÔNG tắt RLS.
-- =============================================================================

-- 1) Hàm kiểm tra admin (chạy như owner để tránh recursive RLS trên profiles).
create or replace function public.is_platform_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = _user_id),
    false
  )
$$;

grant execute on function public.is_platform_admin(uuid) to anon, authenticated;

-- 2) Đảm bảo bảng có RLS bật + grants đúng.
alter table public.gif_library enable row level security;

grant select on public.gif_library to anon, authenticated;
grant insert, update, delete on public.gif_library to authenticated;
grant all on public.gif_library to service_role;

-- 3) Xoá mọi policy cũ (bao gồm cái đang fail) rồi viết lại.
drop policy if exists "gif_library read all"      on public.gif_library;
drop policy if exists "gif_library admin write"   on public.gif_library;
drop policy if exists "gif_library admin insert"  on public.gif_library;
drop policy if exists "gif_library admin update"  on public.gif_library;
drop policy if exists "gif_library admin delete"  on public.gif_library;

-- 4) Ai cũng đọc được (thư viện dùng chung).
create policy "gif_library read all"
  on public.gif_library
  for select
  using (true);

-- 5) Chỉ admin (profiles.is_admin = true) mới ghi.
create policy "gif_library admin insert"
  on public.gif_library
  for insert
  to authenticated
  with check (public.is_platform_admin(auth.uid()));

create policy "gif_library admin update"
  on public.gif_library
  for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

create policy "gif_library admin delete"
  on public.gif_library
  for delete
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- 6) (Tuỳ chọn) tự gán created_by = auth.uid() cho insert.
alter table public.gif_library
  alter column created_by set default auth.uid();

-- =============================================================================
-- CÁCH VERIFY (chạy bằng chính tài khoản admin đang bị lỗi):
--   select public.is_platform_admin(auth.uid());     -- phải trả về true
--   insert into public.gif_library (url, kind, label)
--     values ('https://example.com/x.gif', 'gif', 'test');   -- phải OK
-- =============================================================================
