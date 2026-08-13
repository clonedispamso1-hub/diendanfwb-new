-- CALL SYSTEM V2 — chạy 1 lần trên SUPABASE #2 (Media / Clone storage).
-- KHÔNG chạy trên Supabase #1 (Auth / Member / Feed / Chat).
--
-- 1) Bảng cuộc gọi tối giản — chỉ giữ đúng các trường cần thiết.
create table if not exists public.call_sessions2 (
  id uuid primary key default gen_random_uuid(),
  receiver_uid uuid not null,
  clone_uid uuid not null,
  media_url text not null,
  media_path text not null,
  media_type text not null check (media_type in ('video','voice')),
  duration int not null default 3,
  clone_name text,
  clone_avatar text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes')
);

create index if not exists call_sessions2_receiver_idx
  on public.call_sessions2 (receiver_uid, expires_at desc);

grant select, insert, update, delete on public.call_sessions2 to anon;
grant all on public.call_sessions2 to service_role;

alter table public.call_sessions2 enable row level security;

drop policy if exists "call2 open read" on public.call_sessions2;
create policy "call2 open read" on public.call_sessions2 for select to anon using (true);

drop policy if exists "call2 open write" on public.call_sessions2;
create policy "call2 open write" on public.call_sessions2 for insert to anon with check (true);

drop policy if exists "call2 open delete" on public.call_sessions2;
create policy "call2 open delete" on public.call_sessions2 for delete to anon using (true);

-- 2) Bucket chứa MP4 / MP3 (public để phát trực tiếp trong thẻ <video>/<audio>).
insert into storage.buckets (id, name, public)
values ('call-media', 'call-media', true)
on conflict (id) do update set public = true;

drop policy if exists "call-media read" on storage.objects;
create policy "call-media read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'call-media');

drop policy if exists "call-media write" on storage.objects;
create policy "call-media write" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'call-media');

drop policy if exists "call-media delete" on storage.objects;
create policy "call-media delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'call-media');
