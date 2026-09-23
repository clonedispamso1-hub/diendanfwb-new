-- MỤC LỚP 2 cho các mục lớp 1 KHÔNG theo tỉnh/thành (ví dụ "VIP ZALO MIỄN PHÍ").
-- Không đụng tới zalo_sub_items_l1 / zalo_area_groups / zalo_user_areas.
-- Idempotent — chạy lại nhiều lần không mất dữ liệu.

create table if not exists public.zalo_sub_items_l2 (
  id             uuid primary key default gen_random_uuid(),
  parent_item_id uuid not null references public.zalo_sub_items_l1(id) on delete cascade,
  name           text not null,
  subtitle       text not null default '',
  image_url      text,
  enabled        boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists zalo_sub_items_l2_parent_idx
  on public.zalo_sub_items_l2 (parent_item_id, sort_order);

grant select, insert, update, delete on public.zalo_sub_items_l2 to anon;
grant select, insert, update, delete on public.zalo_sub_items_l2 to authenticated;
grant all on public.zalo_sub_items_l2 to service_role;

alter table public.zalo_sub_items_l2 enable row level security;

drop policy if exists "zalo_sub_items_l2 read" on public.zalo_sub_items_l2;
create policy "zalo_sub_items_l2 read" on public.zalo_sub_items_l2
  for select to anon, authenticated using (true);

drop policy if exists "zalo_sub_items_l2 insert" on public.zalo_sub_items_l2;
create policy "zalo_sub_items_l2 insert" on public.zalo_sub_items_l2
  for insert to anon, authenticated with check (true);

drop policy if exists "zalo_sub_items_l2 update" on public.zalo_sub_items_l2;
create policy "zalo_sub_items_l2 update" on public.zalo_sub_items_l2
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "zalo_sub_items_l2 delete" on public.zalo_sub_items_l2;
create policy "zalo_sub_items_l2 delete" on public.zalo_sub_items_l2
  for delete to anon, authenticated using (true);
