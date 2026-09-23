-- Supabase #4 — Shop / Vòng Xoay / Rương Đồ & Điều Ước "Tìm Xung Quanh".
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
-- Idempotent — chạy lại nhiều lần đều an toàn.

-- 1) Bảng key/value cấu hình (dùng chung với nearby_settings đã có).
create table if not exists public.nearby_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.nearby_settings to anon, authenticated;
grant insert, update on public.nearby_settings to anon, authenticated;
grant all on public.nearby_settings to service_role;

alter table public.nearby_settings enable row level security;

drop policy if exists "nearby settings read" on public.nearby_settings;
create policy "nearby settings read" on public.nearby_settings
  for select to anon, authenticated using (true);

drop policy if exists "nearby settings insert" on public.nearby_settings;
create policy "nearby settings insert" on public.nearby_settings
  for insert to anon, authenticated with check (true);

drop policy if exists "nearby settings update" on public.nearby_settings;
create policy "nearby settings update" on public.nearby_settings
  for update to anon, authenticated using (true) with check (true);

-- 2) Rương đồ của từng thành viên.
create table if not exists public.nearby_inventory (
  user_id text primary key,
  display_name text,
  coins numeric not null default 0,
  balls jsonb not null default '{}'::jsonb,   -- {"1":2,"7":1}
  shields integer not null default 0,
  picks integer not null default 0,
  spins integer not null default 0,
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.nearby_inventory to anon, authenticated;
grant all on public.nearby_inventory to service_role;

alter table public.nearby_inventory enable row level security;

drop policy if exists "nearby inventory read" on public.nearby_inventory;
create policy "nearby inventory read" on public.nearby_inventory
  for select to anon, authenticated using (true);

drop policy if exists "nearby inventory insert" on public.nearby_inventory;
create policy "nearby inventory insert" on public.nearby_inventory
  for insert to anon, authenticated with check (true);

drop policy if exists "nearby inventory update" on public.nearby_inventory;
create policy "nearby inventory update" on public.nearby_inventory
  for update to anon, authenticated using (true) with check (true);

-- 3) Điều ước 3 triệu (Triệu Gọi Rồng Thần).
create table if not exists public.nearby_dragon_wishes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  display_name text,
  wish_id text not null,
  wish_label text,
  status text not null default 'pending',   -- pending | approved | rejected
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists nearby_dragon_wishes_status_idx
  on public.nearby_dragon_wishes (status, created_at desc);

grant select, insert, update on public.nearby_dragon_wishes to anon, authenticated;
grant all on public.nearby_dragon_wishes to service_role;

alter table public.nearby_dragon_wishes enable row level security;

drop policy if exists "nearby wishes read" on public.nearby_dragon_wishes;
create policy "nearby wishes read" on public.nearby_dragon_wishes
  for select to anon, authenticated using (true);

drop policy if exists "nearby wishes insert" on public.nearby_dragon_wishes;
create policy "nearby wishes insert" on public.nearby_dragon_wishes
  for insert to anon, authenticated with check (true);

drop policy if exists "nearby wishes update" on public.nearby_dragon_wishes;
create policy "nearby wishes update" on public.nearby_dragon_wishes
  for update to anon, authenticated using (true) with check (true);

-- 4) Giá trị cấu hình mặc định.
insert into public.nearby_settings (key, value) values
  ('shop', '{"items":[
    {"key":"ball1","label":"Ngọc 1 Sao","buy":5,"sell":3,"active":true},
    {"key":"ball2","label":"Ngọc 2 Sao","buy":10,"sell":6,"active":true},
    {"key":"ball3","label":"Ngọc 3 Sao","buy":15,"sell":9,"active":true},
    {"key":"ball4","label":"Ngọc 4 Sao","buy":20,"sell":12,"active":true},
    {"key":"ball5","label":"Ngọc 5 Sao","buy":25,"sell":15,"active":true},
    {"key":"ball6","label":"Ngọc 6 Sao","buy":30,"sell":18,"active":true},
    {"key":"ball7","label":"Ngọc 7 Sao","buy":35,"sell":21,"active":true},
    {"key":"shield","label":"Khiên Bảo Vệ","buy":15,"sell":9,"active":true},
    {"key":"pick","label":"Cuốc","buy":25,"sell":15,"active":true},
    {"key":"spin","label":"Lượt Quay","buy":10,"sell":0,"active":true}
  ]}'::jsonb),
  ('wheel', '{"spinPrices":[10,20,50],"dailyFreeSpins":3,"slots":[
    {"id":"coin5","label":"+5 Xu Vàng","short":"5","color":"#fbbf24","kind":"coins","amount":5,"stars":0,"odds":22},
    {"id":"coin10","label":"+10 Xu Vàng","short":"10","color":"#fcd34d","kind":"coins","amount":10,"stars":0,"odds":12},
    {"id":"coin20","label":"+20 Xu Vàng","short":"20","color":"#f59e0b","kind":"coins","amount":20,"stars":0,"odds":10},
    {"id":"coin50","label":"+50 Xu Vàng","short":"50","color":"#eab308","kind":"coins","amount":50,"stars":0,"odds":4},
    {"id":"ball1","label":"Ngọc 1 Sao","short":"1★","color":"#fb923c","kind":"ball","amount":0,"stars":1,"odds":16},
    {"id":"ball4","label":"Ngọc 4 Sao","short":"4★","color":"#f97316","kind":"ball","amount":0,"stars":4,"odds":8},
    {"id":"ball7","label":"Ngọc 7 Sao","short":"7★","color":"#ea580c","kind":"ball","amount":0,"stars":7,"odds":2},
    {"id":"spin1","label":"+1 Lượt Quay","short":"🎟","color":"#34d399","kind":"spin","amount":1,"stars":0,"odds":8},
    {"id":"none","label":"Mất lượt","short":"✕","color":"#cbd5e1","kind":"none","amount":0,"stars":0,"odds":18}
  ]}'::jsonb)
on conflict (key) do nothing;
