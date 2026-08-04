-- ============================================================
-- VOICE CHAT V1 — chạy trên DB Supabase hiện có (dùng lại DB cũ).
-- ============================================================

-- 1. Cột voice cho bảng messages (tuỳ chọn — UI hiện dùng marker trong content,
--    các cột này để phục vụ thống kê / mở rộng sau này).
alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists voice_url text,
  add column if not exists voice_duration integer;

-- 2. Thư viện voice của Admin (clone dùng tham chiếu, không upload lại).
create table if not exists public.voice_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,
  duration integer not null default 0,
  mime_type text,
  category text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select on public.voice_library to authenticated;
grant insert, update, delete on public.voice_library to authenticated;
grant all on public.voice_library to service_role;

alter table public.voice_library enable row level security;

drop policy if exists "voice_library read" on public.voice_library;
create policy "voice_library read"
on public.voice_library for select to authenticated using (true);

drop policy if exists "voice_library admin write" on public.voice_library;
create policy "voice_library admin write"
on public.voice_library for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- 3. Bucket private cho file ghi âm.
insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', false)
on conflict (id) do nothing;

drop policy if exists "voice upload own folder" on storage.objects;
create policy "voice upload own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'voice-messages' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "voice admin upload" on storage.objects;
create policy "voice admin upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'voice-messages'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

drop policy if exists "voice read authenticated" on storage.objects;
create policy "voice read authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'voice-messages');

drop policy if exists "voice delete own or admin" on storage.objects;
create policy "voice delete own or admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'voice-messages'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
);