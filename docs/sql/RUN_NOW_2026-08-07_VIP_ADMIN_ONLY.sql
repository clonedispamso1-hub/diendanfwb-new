-- Kho Icon/GIF VIP: cờ "chỉ Admin" + RLS chặn user thường đọc.
-- Chạy 1 lần trên Supabase (SQL Editor).

alter table public.vip_icons add column if not exists is_admin_only boolean not null default true;
alter table public.vip_gifs  add column if not exists is_admin_only boolean not null default true;

create index if not exists vip_icons_admin_only_idx on public.vip_icons (is_admin_only, folder);
create index if not exists vip_gifs_admin_only_idx  on public.vip_gifs  (is_admin_only, folder);

-- SELECT: dòng admin-only chỉ Admin thấy; dòng công khai ai cũng thấy.
drop policy if exists "vip_icons read" on public.vip_icons;
create policy "vip_icons read" on public.vip_icons
  for select
  using (is_admin_only = false or public.has_role(auth.uid(), 'admin'));

drop policy if exists "vip_gifs read" on public.vip_gifs;
create policy "vip_gifs read" on public.vip_gifs
  for select
  using (is_admin_only = false or public.has_role(auth.uid(), 'admin'));
