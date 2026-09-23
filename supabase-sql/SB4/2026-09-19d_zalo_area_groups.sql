-- LỚP 2: KHU VỰC → NHÓM ZALO / LINE
-- Mỗi khu vực (quận/huyện) của một mục lớp 1 có danh sách nhóm RIÊNG.
-- Cấu trúc dùng chung cho Zalo + LINE và cho Việt Nam / Đài Loan / Nhật Bản.
-- Idempotent — chạy lại nhiều lần không mất dữ liệu.

create table if not exists public.zalo_area_groups (
  id           uuid primary key default gen_random_uuid(),
  platform     text not null default 'zalo',      -- 'zalo' | 'line'
  country_id   text not null default 'vn',        -- 'vn' | 'tw' | 'jp'
  item_id      uuid not null references public.zalo_sub_items_l1(id) on delete cascade,
  province     text not null default '',          -- tỉnh/thành (rỗng nếu mục không theo LOCATION)
  area_id      text not null default '',          -- khu vực (quận/huyện)
  name         text not null,
  avatar_url   text,
  member_count integer not null default 0,
  men_count    integer not null default 0,
  women_count  integer not null default 0,
  gold_key     integer not null default 0,
  silver_key   integer not null default 0,
  join_url     text not null default '',
  enabled      boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists zalo_area_groups_scope_idx
  on public.zalo_area_groups (item_id, province, area_id, sort_order);
create index if not exists zalo_area_groups_platform_idx
  on public.zalo_area_groups (platform, country_id);

grant select, insert, update, delete on public.zalo_area_groups to anon;
grant select, insert, update, delete on public.zalo_area_groups to authenticated;
grant all on public.zalo_area_groups to service_role;

alter table public.zalo_area_groups enable row level security;

drop policy if exists "zalo_area_groups read" on public.zalo_area_groups;
create policy "zalo_area_groups read" on public.zalo_area_groups
  for select to anon, authenticated using (true);

drop policy if exists "zalo_area_groups insert" on public.zalo_area_groups;
create policy "zalo_area_groups insert" on public.zalo_area_groups
  for insert to anon, authenticated with check (true);

drop policy if exists "zalo_area_groups update" on public.zalo_area_groups;
create policy "zalo_area_groups update" on public.zalo_area_groups
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "zalo_area_groups delete" on public.zalo_area_groups;
create policy "zalo_area_groups delete" on public.zalo_area_groups
  for delete to anon, authenticated using (true);
