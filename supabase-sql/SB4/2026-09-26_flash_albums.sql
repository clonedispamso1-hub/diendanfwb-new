-- Supabase #4 (ybzdpxwbpbkeqkqwbscp) — MODULE ⚡ ALBUM ẢNH
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
-- Chỉ tạo bảng / bucket / hàm MỚI có tiền tố `flash_` — không đụng module khác
-- (kể cả bảng `albums` + bucket `album-covers` của "Quản Lý Album" cũ).
--
-- Ghi dữ liệu: CHỈ qua máy chủ (service role, sau khi xác minh Admin).
-- Người dùng thường: chỉ đọc + tăng lượt xem / lượt thích qua RPC.

create table if not exists public.flash_albums (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{3}-[0-9]{3}$'),
  name text not null,
  cover_media_id uuid,
  like_count bigint not null default 0,
  view_count bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.flash_album_media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.flash_albums(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  storage_path text not null,
  url text not null,
  size_bytes bigint not null default 0,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists flash_album_media_album_idx on public.flash_album_media(album_id, created_at);

grant select on public.flash_albums, public.flash_album_media to anon, authenticated;
grant all on public.flash_albums, public.flash_album_media to service_role;

alter table public.flash_albums enable row level security;
alter table public.flash_album_media enable row level security;

drop policy if exists "flash albums read" on public.flash_albums;
create policy "flash albums read" on public.flash_albums for select to anon, authenticated using (true);
drop policy if exists "flash album media read" on public.flash_album_media;
create policy "flash album media read" on public.flash_album_media for select to anon, authenticated using (true);

-- Tăng lượt xem (+1 mỗi lần xem)
create or replace function public.flash_album_view(_album_id uuid)
returns bigint language sql security definer set search_path = public as $$
  update public.flash_albums set view_count = view_count + 1 where id = _album_id returning view_count;
$$;

-- Tăng lượt thích
create or replace function public.flash_album_like(_album_id uuid)
returns bigint language sql security definer set search_path = public as $$
  update public.flash_albums set like_count = like_count + 1 where id = _album_id returning like_count;
$$;

grant execute on function public.flash_album_view(uuid) to anon, authenticated;
grant execute on function public.flash_album_like(uuid) to anon, authenticated;

-- Bucket công khai riêng cho module ⚡ (chỉ đọc công khai; ghi qua máy chủ)
insert into storage.buckets (id, name, public)
values ('flash-albums', 'flash-albums', true)
on conflict (id) do nothing;

drop policy if exists "flash albums media public read" on storage.objects;
create policy "flash albums media public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'flash-albums');
