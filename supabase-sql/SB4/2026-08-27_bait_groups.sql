-- Supabase #4 — Nhóm Mồi (Bait Groups)
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.

create table if not exists public.bait_group_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  by_location boolean not null default false,
  name_template text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.bait_groups (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.bait_group_folders(id) on delete cascade,
  name text not null,
  province text,
  avatar_url text,
  member_count int not null default 0,
  message_count int not null default 0,
  preview_text text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bait_groups_folder_idx on public.bait_groups(folder_id);
create index if not exists bait_groups_province_idx on public.bait_groups(province);

grant select on public.bait_group_folders to anon, authenticated;
grant select on public.bait_groups to anon, authenticated;
grant all on public.bait_group_folders to service_role;
grant all on public.bait_groups to service_role;

alter table public.bait_group_folders enable row level security;
alter table public.bait_groups enable row level security;

drop policy if exists "public read folders" on public.bait_group_folders;
create policy "public read folders" on public.bait_group_folders
  for select to anon, authenticated using (true);

drop policy if exists "public read groups" on public.bait_groups;
create policy "public read groups" on public.bait_groups
  for select to anon, authenticated using (true);

-- Bucket public cho avatar nhóm mồi
insert into storage.buckets (id, name, public)
values ('bait-groups', 'bait-groups', true)
on conflict (id) do nothing;

drop policy if exists "bait groups public read" on storage.objects;
create policy "bait groups public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'bait-groups');
