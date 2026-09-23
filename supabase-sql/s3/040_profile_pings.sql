-- Supabase #3 (chat) — bảng lưu trạng thái PING giữa 2 người dùng.
--
-- Quy tắc: mỗi cặp (sender_id -> receiver_id) chỉ được Ping ĐÚNG 1 LẦN.
-- Ràng buộc PRIMARY KEY (sender_id, receiver_id) chặn trùng ở tầng database,
-- không phụ thuộc React state hay localStorage.

create table if not exists public.profile_pings (
  sender_id uuid not null,
  receiver_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (sender_id, receiver_id)
);

-- Index phục vụ truy vấn "tôi đã ping ai" (chỉ dùng cho 1 cặp mỗi lần).
create index if not exists profile_pings_receiver_idx
  on public.profile_pings (receiver_id);

grant select, insert on public.profile_pings to anon;
grant all on public.profile_pings to service_role;

alter table public.profile_pings enable row level security;

drop policy if exists profile_pings_select_anon_bridge on public.profile_pings;
create policy profile_pings_select_anon_bridge on public.profile_pings
  for select to anon using (true);

drop policy if exists profile_pings_insert_anon_bridge on public.profile_pings;
create policy profile_pings_insert_anon_bridge on public.profile_pings
  for insert to anon with check (true);
