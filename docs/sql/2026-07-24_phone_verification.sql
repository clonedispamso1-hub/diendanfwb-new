-- Phone verification for Tìm Zalo feature.
-- Safe to run multiple times.

alter table public.profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz;

create table if not exists public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  device text,
  browser text,
  user_agent text,
  ip text,
  verified_at timestamptz not null default now()
);

create index if not exists phone_verifications_user_id_idx
  on public.phone_verifications(user_id);
create index if not exists phone_verifications_verified_at_idx
  on public.phone_verifications(verified_at desc);

grant select, insert on public.phone_verifications to authenticated;
grant all on public.phone_verifications to service_role;

alter table public.phone_verifications enable row level security;

drop policy if exists "phone_verifications self insert" on public.phone_verifications;
create policy "phone_verifications self insert"
  on public.phone_verifications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "phone_verifications self select" on public.phone_verifications;
create policy "phone_verifications self select"
  on public.phone_verifications
  for select
  to authenticated
  using (auth.uid() = user_id or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true
  ));