-- Popup "VIP Zalo" — quản lý 3 card quốc gia (Việt Nam, Đài Loan, Nhật Bản).
-- Admin Panel > Nhóm Zalo Mồi: sửa subtitle + Bật/Tắt từng card.
-- Idempotent: chạy lại nhiều lần không mất dữ liệu.

create table if not exists public.zalo_country_cards (
  id          text primary key,
  title       text not null,
  subtitle    text not null default '',
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

grant select, insert, update on public.zalo_country_cards to anon;
grant select, insert, update on public.zalo_country_cards to authenticated;
grant all on public.zalo_country_cards to service_role;

alter table public.zalo_country_cards enable row level security;

drop policy if exists "zalo_country_cards read" on public.zalo_country_cards;
create policy "zalo_country_cards read"
  on public.zalo_country_cards for select
  to anon, authenticated using (true);

drop policy if exists "zalo_country_cards insert" on public.zalo_country_cards;
create policy "zalo_country_cards insert"
  on public.zalo_country_cards for insert
  to anon, authenticated with check (id in ('vn', 'tw', 'jp'));

drop policy if exists "zalo_country_cards update" on public.zalo_country_cards;
create policy "zalo_country_cards update"
  on public.zalo_country_cards for update
  to anon, authenticated using (id in ('vn', 'tw', 'jp')) with check (id in ('vn', 'tw', 'jp'));

insert into public.zalo_country_cards (id, title, subtitle, enabled, sort_order) values
  ('vn', 'VIP ZALO VIỆT NAM', 'Các nhóm VIP Zalo ở Việt Nam', true, 1),
  ('tw', 'VIP ZALO ĐÀI LOAN', 'Các nhóm VIP Zalo và LINE dành cho hội viên tại Đài Loan', true, 2),
  ('jp', 'VIP ZALO NHẬT BẢN', 'Các nhóm VIP Zalo và LINE dành cho hội viên tại Nhật Bản', true, 3)
on conflict (id) do nothing;
