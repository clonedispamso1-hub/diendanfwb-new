-- Run in the existing Supabase #4 project. Reuses the existing public
-- `flash-albums` Storage bucket; banner objects live under hot-banners/.
-- No changes to existing flash_albums, auth, or other modules.
create table if not exists public.flash_hot_banners (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  image_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.flash_hot_banners to anon, authenticated;
grant all on public.flash_hot_banners to service_role;
alter table public.flash_hot_banners enable row level security;
drop policy if exists "Read active HOT banners" on public.flash_hot_banners;
create policy "Read active HOT banners" on public.flash_hot_banners
  for select to anon, authenticated using (active = true);

create table if not exists public.flash_hot_codes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 160),
  content text not null default '',
  code text not null check (length(code) between 1 and 120),
  expires_at timestamptz,
  status text not null default 'published' check (status in ('published', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.flash_hot_codes to anon, authenticated;
grant all on public.flash_hot_codes to service_role;
alter table public.flash_hot_codes enable row level security;
drop policy if exists "Read published HOT codes" on public.flash_hot_codes;
create policy "Read published HOT codes" on public.flash_hot_codes
  for select to anon, authenticated using (status = 'published' and (expires_at is null or expires_at > now()));
create index if not exists flash_hot_codes_recent on public.flash_hot_codes(created_at desc);