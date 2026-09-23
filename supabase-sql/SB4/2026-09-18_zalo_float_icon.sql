-- Supabase #4 — "Icon Zalo nổi" (ảnh + bật/tắt cho icon nổi ở Trang Chủ)
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
-- Idempotent — chạy lại nhiều lần đều an toàn.

create table if not exists public.zalo_float_icon (
  id text primary key default 'main',
  image_url text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.zalo_float_icon (id, image_url, enabled)
values ('main', null, true)
on conflict (id) do nothing;

grant select on public.zalo_float_icon to anon, authenticated;
grant insert, update on public.zalo_float_icon to anon, authenticated;
grant all on public.zalo_float_icon to service_role;

alter table public.zalo_float_icon enable row level security;

drop policy if exists "zalo float icon read" on public.zalo_float_icon;
create policy "zalo float icon read" on public.zalo_float_icon
  for select to anon, authenticated using (true);

drop policy if exists "zalo float icon insert" on public.zalo_float_icon;
create policy "zalo float icon insert" on public.zalo_float_icon
  for insert to anon, authenticated with check (true);

drop policy if exists "zalo float icon update" on public.zalo_float_icon;
create policy "zalo float icon update" on public.zalo_float_icon
  for update to anon, authenticated using (true) with check (true);

-- Bucket ảnh icon (công khai để Trang Chủ đọc được).
insert into storage.buckets (id, name, public)
values ('zalo-float-icon', 'zalo-float-icon', true)
on conflict (id) do update set public = true;

drop policy if exists "zalo float icon public read" on storage.objects;
create policy "zalo float icon public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'zalo-float-icon');

drop policy if exists "zalo float icon upload" on storage.objects;
create policy "zalo float icon upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'zalo-float-icon');

drop policy if exists "zalo float icon update obj" on storage.objects;
create policy "zalo float icon update obj" on storage.objects
  for update to anon, authenticated using (bucket_id = 'zalo-float-icon')
  with check (bucket_id = 'zalo-float-icon');

drop policy if exists "zalo float icon delete obj" on storage.objects;
create policy "zalo float icon delete obj" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'zalo-float-icon');
