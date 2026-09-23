-- Supabase #4 — NHẬN DIỆN WEBSITE dùng chung (logo, favicon, SEO).
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
-- Idempotent — chạy lại nhiều lần đều an toàn.

create table if not exists public.site_branding (
  id text primary key default 'main',
  logo_url text,
  logo_size int not null default 56,
  favicon_url text,
  seo_title text,
  seo_description text,
  seo_keywords text,
  og_image_url text,
  updated_at timestamptz not null default now()
);

insert into public.site_branding (id) values ('main')
on conflict (id) do nothing;

grant select on public.site_branding to anon, authenticated;
grant insert, update on public.site_branding to anon, authenticated;
grant all on public.site_branding to service_role;

alter table public.site_branding enable row level security;

drop policy if exists "site branding read" on public.site_branding;
create policy "site branding read" on public.site_branding
  for select to anon, authenticated using (true);

drop policy if exists "site branding insert" on public.site_branding;
create policy "site branding insert" on public.site_branding
  for insert to anon, authenticated with check (true);

drop policy if exists "site branding update" on public.site_branding;
create policy "site branding update" on public.site_branding
  for update to anon, authenticated using (true) with check (true);

-- Kho ảnh công khai cho logo / favicon / ảnh chia sẻ.
insert into storage.buckets (id, name, public)
values ('site-branding', 'site-branding', true)
on conflict (id) do update set public = true;

drop policy if exists "site branding files read" on storage.objects;
create policy "site branding files read" on storage.objects
  for select using (bucket_id = 'site-branding');

drop policy if exists "site branding files insert" on storage.objects;
create policy "site branding files insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'site-branding');

drop policy if exists "site branding files update" on storage.objects;
create policy "site branding files update" on storage.objects
  for update to anon, authenticated using (bucket_id = 'site-branding') with check (bucket_id = 'site-branding');

drop policy if exists "site branding files delete" on storage.objects;
create policy "site branding files delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'site-branding');
