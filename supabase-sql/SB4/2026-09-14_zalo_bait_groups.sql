-- Supabase #4 — "Nhóm Zalo Mồi" (popup icon Zalo)
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
-- Idempotent — chạy lại nhiều lần đều an toàn.
-- KHÔNG liên quan Supabase 1/2/3 và không đụng bảng bait_groups cũ.

create table if not exists public.zalo_bait_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  message_count bigint not null default 0,
  member_count integer not null default 0,
  men_count integer not null default 0,
  women_count integer not null default 0,
  admin_count integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint zalo_bait_groups_sum_ck
    check (men_count + women_count + admin_count = member_count)
);

create index if not exists zalo_bait_groups_sort_idx
  on public.zalo_bait_groups (sort_order, created_at desc);

grant select on public.zalo_bait_groups to anon, authenticated;
grant insert, update, delete on public.zalo_bait_groups to anon, authenticated;
grant all on public.zalo_bait_groups to service_role;

alter table public.zalo_bait_groups enable row level security;

drop policy if exists "zalo bait groups read" on public.zalo_bait_groups;
create policy "zalo bait groups read" on public.zalo_bait_groups
  for select to anon, authenticated using (true);

drop policy if exists "zalo bait groups insert" on public.zalo_bait_groups;
create policy "zalo bait groups insert" on public.zalo_bait_groups
  for insert to anon, authenticated with check (true);

drop policy if exists "zalo bait groups update" on public.zalo_bait_groups;
create policy "zalo bait groups update" on public.zalo_bait_groups
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "zalo bait groups delete" on public.zalo_bait_groups;
create policy "zalo bait groups delete" on public.zalo_bait_groups
  for delete to anon, authenticated using (true);
