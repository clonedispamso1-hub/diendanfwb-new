-- Persistent, shared GIF / sticker library for the composer picker.
-- Read by everyone (anon + authenticated); insert/update/delete only by admins.

create table if not exists public.gif_library (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  kind text not null check (kind in ('gif','sticker','icon')),
  label text not null default '',
  keywords text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists gif_library_kind_created_idx
  on public.gif_library (kind, created_at desc);

grant select on public.gif_library to anon, authenticated;
grant insert, update, delete on public.gif_library to authenticated;
grant all on public.gif_library to service_role;

alter table public.gif_library enable row level security;

drop policy if exists "gif_library read all" on public.gif_library;
create policy "gif_library read all" on public.gif_library
  for select using (true);

drop policy if exists "gif_library admin write" on public.gif_library;
create policy "gif_library admin write" on public.gif_library
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));