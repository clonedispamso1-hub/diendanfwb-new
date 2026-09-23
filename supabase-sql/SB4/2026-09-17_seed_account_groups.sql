-- Supabase #4 — Gán "Nhóm mồi" cho Tài khoản thứ hai (seed accounts)
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
-- Idempotent — chạy lại nhiều lần đều an toàn.
--
-- Ghi chú:
--  • account_id là profiles.id nằm ở Supabase #1 → KHÔNG thể tạo foreign key.
--  • group_kind: 'bait' = public.bait_groups ("Nhóm Mới"), 'zalo' = public.zalo_bait_groups.
--  • Khoá chính (account_id, group_kind, group_id) đảm bảo 1 nhóm chỉ gán 1 lần cho 1 account.
--  • Không tạo hệ thống nhóm mới, không sửa bảng nhóm hiện có.

create table if not exists public.seed_account_groups (
  account_id uuid not null,
  group_kind text not null check (group_kind in ('bait', 'zalo')),
  group_id   uuid not null,
  created_at timestamptz not null default now(),
  primary key (account_id, group_kind, group_id)
);

create index if not exists seed_account_groups_account_idx
  on public.seed_account_groups (account_id);
create index if not exists seed_account_groups_group_idx
  on public.seed_account_groups (group_kind, group_id);

grant select, insert, update, delete on public.seed_account_groups to anon, authenticated;
grant all on public.seed_account_groups to service_role;

alter table public.seed_account_groups enable row level security;

drop policy if exists "seed account groups read" on public.seed_account_groups;
create policy "seed account groups read" on public.seed_account_groups
  for select to anon, authenticated using (true);

drop policy if exists "seed account groups insert" on public.seed_account_groups;
create policy "seed account groups insert" on public.seed_account_groups
  for insert to anon, authenticated with check (true);

drop policy if exists "seed account groups update" on public.seed_account_groups;
create policy "seed account groups update" on public.seed_account_groups
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "seed account groups delete" on public.seed_account_groups;
create policy "seed account groups delete" on public.seed_account_groups
  for delete to anon, authenticated using (true);
