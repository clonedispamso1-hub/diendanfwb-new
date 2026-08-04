-- ============================================================
-- "Ai xem hồ sơ" — chỉ lưu lượt xem TRONG NGÀY (siêu nhẹ)
-- ------------------------------------------------------------
-- Chạy file này 1 lần trong Supabase SQL Editor của DB CŨ.
-- Không sửa bảng cũ, không đổi URL / API key.
--
-- * 1 người xem 1 hồ sơ => tối đa 1 record/ngày (primary key dedupe)
-- * Không tính lượt xem của chính mình
-- * Dữ liệu ngày cũ tự xoá (dọn dẹp cơ hội bên trong RPC)
-- * Không realtime, không notification
-- ============================================================

create table if not exists public.profile_views_today (
  viewed_id  uuid not null references auth.users(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id) on delete cascade,
  view_date  date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  viewed_at  timestamptz not null default now(),
  constraint profile_views_today_pkey primary key (viewed_id, viewer_id, view_date),
  constraint profile_views_today_not_self check (viewer_id <> viewed_id)
);

-- Index phục vụ đúng 1 truy vấn: người xem hồ sơ của tôi hôm nay, mới nhất trước.
create index if not exists profile_views_today_owner_idx
  on public.profile_views_today (viewed_id, view_date, viewed_at desc);

grant select, insert on public.profile_views_today to authenticated;
grant all on public.profile_views_today to service_role;

alter table public.profile_views_today enable row level security;

drop policy if exists "owner can read own profile views" on public.profile_views_today;
create policy "owner can read own profile views"
  on public.profile_views_today
  for select to authenticated
  using (viewed_id = auth.uid());

drop policy if exists "viewer can insert own view" on public.profile_views_today;
create policy "viewer can insert own view"
  on public.profile_views_today
  for insert to authenticated
  with check (viewer_id = auth.uid() and viewer_id <> viewed_id);

-- RPC: ghi 1 lượt xem (idempotent trong ngày) + dọn dữ liệu cũ theo xác suất.
create or replace function public.record_profile_view(p_viewed uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := ((now() at time zone 'Asia/Ho_Chi_Minh')::date);
begin
  if auth.uid() is null or p_viewed is null or p_viewed = auth.uid() then
    return;
  end if;

  insert into public.profile_views_today (viewed_id, viewer_id, view_date, viewed_at)
  values (p_viewed, auth.uid(), v_today, now())
  on conflict (viewed_id, viewer_id, view_date) do nothing;

  -- Dọn dẹp nhẹ: ~1% số lần ghi sẽ xoá các ngày trước đó.
  if random() < 0.01 then
    delete from public.profile_views_today where view_date < v_today;
  end if;
end;
$$;

grant execute on function public.record_profile_view(uuid) to authenticated;
