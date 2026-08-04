-- =====================================================================
-- Profile Premium Upgrade — Gallery + Stories + Story Views
-- Chạy trong Supabase SQL Editor (project zbuwddjcqdlyijcunwgd).
-- Idempotent: an toàn khi chạy lại.
-- =====================================================================

-- 1) profile_gallery (max 5 ảnh / user) -------------------------------
create table if not exists public.profile_gallery (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  image_url   text not null,
  public_id   text,
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists profile_gallery_user_idx
  on public.profile_gallery (user_id, position, created_at);

alter table public.profile_gallery enable row level security;

drop policy if exists "gallery_select_all"   on public.profile_gallery;
drop policy if exists "gallery_insert_own"   on public.profile_gallery;
drop policy if exists "gallery_update_own"   on public.profile_gallery;
drop policy if exists "gallery_delete_own"   on public.profile_gallery;

create policy "gallery_select_all" on public.profile_gallery
  for select to anon, authenticated using (true);
create policy "gallery_insert_own" on public.profile_gallery
  for insert to authenticated with check (auth.uid() = user_id);
create policy "gallery_update_own" on public.profile_gallery
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "gallery_delete_own" on public.profile_gallery
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.enforce_gallery_max()
returns trigger language plpgsql as $$
declare cnt int;
begin
  select count(*) into cnt from public.profile_gallery where user_id = new.user_id;
  if cnt >= 5 then raise exception 'GALLERY_MAX_5'; end if;
  return new;
end$$;

drop trigger if exists profile_gallery_max on public.profile_gallery;
create trigger profile_gallery_max
  before insert on public.profile_gallery
  for each row execute function public.enforce_gallery_max();

-- 2) stories (tự huỷ sau 24h) -----------------------------------------
create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  media_url   text not null,
  public_id   text,
  media_type  text not null default 'image' check (media_type in ('image','video')),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  created_at  timestamptz not null default now()
);

create index if not exists stories_user_idx    on public.stories (user_id, created_at desc);
create index if not exists stories_expires_idx on public.stories (expires_at);

alter table public.stories enable row level security;

drop policy if exists "stories_select_active" on public.stories;
drop policy if exists "stories_insert_own"    on public.stories;
drop policy if exists "stories_delete_own"    on public.stories;

create policy "stories_select_active" on public.stories
  for select to anon, authenticated using (expires_at > now());
create policy "stories_insert_own" on public.stories
  for insert to authenticated with check (auth.uid() = user_id);
create policy "stories_delete_own" on public.stories
  for delete to authenticated using (auth.uid() = user_id);

-- 3) story_views ------------------------------------------------------
create table if not exists public.story_views (
  story_id  uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

alter table public.story_views enable row level security;

drop policy if exists "story_views_select"     on public.story_views;
drop policy if exists "story_views_insert_own" on public.story_views;

create policy "story_views_select" on public.story_views
  for select to authenticated
  using (
    auth.uid() = viewer_id
    or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
  );
create policy "story_views_insert_own" on public.story_views
  for insert to authenticated with check (auth.uid() = viewer_id);

-- 4) pg_cron + pg_net → gọi edge function mỗi 15 phút -----------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  perform cron.unschedule('cleanup-expired-stories');
exception when others then null;
end$$;

select cron.schedule(
  'cleanup-expired-stories',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://zbuwddjcqdlyijcunwgd.supabase.co/functions/v1/cleanup-stories',
    headers := jsonb_build_object('Content-Type','application/json')
  );
  $$
);
