-- Supabase #4 — Tố Cáo Nhận Thưởng (reports)
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  reporter_name text,
  target_uid text not null,
  target_name text,
  target_avatar text,
  kind text not null default 'post',           -- post | message | profile
  reason text not null default '',
  proof_url text,
  status text not null default 'pending',      -- pending | approved | rejected
  reward_amount int not null default 500000,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists reports_status_idx on public.reports(status, created_at desc);
create index if not exists reports_reporter_idx on public.reports(reporter_id);

grant select, insert, update on public.reports to anon, authenticated;
grant all on public.reports to service_role;

alter table public.reports enable row level security;

drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports
  for select to anon, authenticated using (true);

drop policy if exists "reports insert" on public.reports;
create policy "reports insert" on public.reports
  for insert to anon, authenticated with check (true);

drop policy if exists "reports update" on public.reports;
create policy "reports update" on public.reports
  for update to anon, authenticated using (true) with check (true);

-- Bucket public cho ảnh bằng chứng
insert into storage.buckets (id, name, public)
values ('report-proofs', 'report-proofs', true)
on conflict (id) do nothing;

drop policy if exists "report proofs read" on storage.objects;
create policy "report proofs read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'report-proofs');

drop policy if exists "report proofs write" on storage.objects;
create policy "report proofs write" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'report-proofs');
