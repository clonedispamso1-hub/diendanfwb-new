-- VIP ZALO {LOCATION} — danh sách khu vực CỐ ĐỊNH theo từng user.
-- Random 1 lần duy nhất rồi lưu lại; các lần sau luôn đọc lại danh sách cũ.
-- Idempotent: chạy lại nhiều lần không mất dữ liệu.

create table if not exists public.zalo_user_areas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  item_id    uuid not null references public.zalo_sub_items_l1(id) on delete cascade,
  province   text not null default '',
  area_ids   text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Mỗi user chỉ có 1 danh sách cho mỗi mục + mỗi tỉnh/thành đã đăng ký.
create unique index if not exists zalo_user_areas_uniq
  on public.zalo_user_areas (user_id, item_id, province);

create index if not exists zalo_user_areas_user_idx
  on public.zalo_user_areas (user_id);

grant select, insert on public.zalo_user_areas to anon;
grant select, insert, update, delete on public.zalo_user_areas to authenticated;
grant all on public.zalo_user_areas to service_role;

alter table public.zalo_user_areas enable row level security;

drop policy if exists "zalo_user_areas read" on public.zalo_user_areas;
create policy "zalo_user_areas read" on public.zalo_user_areas
  for select to anon, authenticated using (true);

drop policy if exists "zalo_user_areas insert" on public.zalo_user_areas;
create policy "zalo_user_areas insert" on public.zalo_user_areas
  for insert to anon, authenticated with check (true);

drop policy if exists "zalo_user_areas delete" on public.zalo_user_areas;
create policy "zalo_user_areas delete" on public.zalo_user_areas
  for delete to authenticated using (true);
