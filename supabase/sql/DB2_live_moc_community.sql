-- ============================================================
-- SUPABASE #2 (Database phụ) — Live Móc 🦋 + Cộng Đồng VIP
-- Chạy file này trên SQL Editor của project Supabase #2
-- (VITE_MEDIA_SUPABASE_URL). KHÔNG chạy trên DB chính.
-- ============================================================

create table if not exists public.live_moc_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text not null default '',
  thumbnail_url text not null default '',
  viewers integer not null default 0,
  is_online boolean not null default true,
  visible boolean not null default true,
  sort_order integer not null default 0,
  contact_url text not null default '',
  vip_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_moc_settings (
  id integer primary key default 1,
  admin_contact_url text not null default '',
  vip_community_url text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.community_page (
  id integer primary key default 1,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.live_moc_settings (id) values (1) on conflict (id) do nothing;
insert into public.community_page (id) values (1) on conflict (id) do nothing;

-- Grants (DB #2 không có auth riêng → client dùng anon key)
grant select, insert, update, delete on public.live_moc_rooms to anon, authenticated;
grant select, insert, update, delete on public.live_moc_settings to anon, authenticated;
grant select, insert, update, delete on public.community_page to anon, authenticated;
grant all on public.live_moc_rooms, public.live_moc_settings, public.community_page to service_role;

alter table public.live_moc_rooms enable row level security;
alter table public.live_moc_settings enable row level security;
alter table public.community_page enable row level security;

drop policy if exists "live_moc_rooms_all" on public.live_moc_rooms;
create policy "live_moc_rooms_all" on public.live_moc_rooms for all using (true) with check (true);

drop policy if exists "live_moc_settings_all" on public.live_moc_settings;
create policy "live_moc_settings_all" on public.live_moc_settings for all using (true) with check (true);

drop policy if exists "community_page_all" on public.community_page;
create policy "community_page_all" on public.community_page for all using (true) with check (true);

create index if not exists live_moc_rooms_order_idx on public.live_moc_rooms (sort_order, created_at desc);
