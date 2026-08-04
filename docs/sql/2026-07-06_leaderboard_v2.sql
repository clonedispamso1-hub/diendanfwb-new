-- =====================================================================
-- Leaderboard v2 (Task #4)
-- File: docs/sql/2026-07-06_leaderboard_v2.sql
-- =====================================================================
-- Mục tiêu:
--  • RPC-based leaderboards, không polling frontend, không hardcode.
--  • Loại trừ account bị khoá / xoá / ẩn.
--  • Filter theo period: today | week | month | all.
--  • Nhóm: FOLLOW (theo period), POSTS (like/comment/tương tác), USERS
--    (uy tín / VIP / candy / gem).
-- Idempotent — có thể chạy lại nhiều lần.
-- KHÔNG rollback migration cũ. KHÔNG động vào leaderboard_daily hiện có.
-- =====================================================================

-- 1) Indexes (idempotent) hỗ trợ query nhanh -------------------------------

create index if not exists idx_follows_following_created
  on public.follows (following_id, created_at desc);

create index if not exists idx_follows_created
  on public.follows (created_at desc);

do $$ begin
  if to_regclass('public.post_likes') is not null then
    execute 'create index if not exists idx_post_likes_post on public.post_likes (post_id)';
    execute 'create index if not exists idx_post_likes_created on public.post_likes (created_at desc)';
  end if;
  if to_regclass('public.comments') is not null then
    execute 'create index if not exists idx_comments_post on public.comments (post_id)';
    execute 'create index if not exists idx_comments_created on public.comments (created_at desc)';
  end if;
end $$;

-- 2) Helper: khoảng thời gian từ period --------------------------------------

create or replace function public._lb_period_start(_period text)
returns timestamptz
language sql
immutable
as $$
  select case lower(coalesce(_period, 'all'))
    when 'today' then date_trunc('day', now())
    when 'week'  then date_trunc('week', now())
    when 'month' then date_trunc('month', now())
    else '-infinity'::timestamptz
  end
$$;

-- 3) Điều kiện lọc profile hợp lệ (SQL fragment tái sử dụng)
--    Trả TRUE nếu profile p KHÔNG bị khoá / xoá / ẩn.
create or replace function public._lb_profile_ok(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = _uid
      and coalesce(p.is_banned, false) = false
      and coalesce(p.account_status, 'active') = 'active'
  )
$$;

grant execute on function public._lb_profile_ok(uuid) to anon, authenticated, service_role;

-- 4) RPC: leaderboard_follow(period) ----------------------------------------
--    Trả top 50 user có nhiều follow nhất trong khoảng period.
create or replace function public.leaderboard_follow(_period text default 'today')
returns table (
  user_id uuid,
  score bigint,
  full_name text,
  username text,
  avatar text,
  vip_level int,
  reputation_score int
)
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select f.following_id as uid, count(*)::bigint as sc
    from public.follows f
    where f.created_at >= public._lb_period_start(_period)
    group by f.following_id
  )
  select p.id, a.sc,
         p.full_name, p.username, p.avatar,
         p.vip_level, p.reputation_score
  from agg a
  join public.profiles p on p.id = a.uid
  where coalesce(p.is_banned, false) = false
    and coalesce(p.account_status, 'active') = 'active'
  order by a.sc desc, p.id
  limit 50
$$;

grant execute on function public.leaderboard_follow(text) to anon, authenticated, service_role;

-- 5) RPC: leaderboard_posts(kind, period) -----------------------------------
--    kind: 'likes' | 'comments' | 'interactions'
--    Trả top 50 bài viết + thông tin tác giả.
create or replace function public.leaderboard_posts(
  _kind text default 'likes',
  _period text default 'all'
)
returns table (
  post_id uuid,
  author_id uuid,
  score bigint,
  full_name text,
  username text,
  avatar text,
  vip_level int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _since timestamptz := public._lb_period_start(_period);
  _k text := lower(coalesce(_kind, 'likes'));
begin
  return query
  with
    likes_agg as (
      select post_id, count(*)::bigint as c
      from public.post_likes
      where _k in ('likes', 'interactions')
      group by post_id
    ),
    comments_agg as (
      select post_id, count(*)::bigint as c
      from public.comments
      where _k in ('comments', 'interactions')
      group by post_id
    ),
    combined as (
      select po.id as pid, po.user_id as uid,
        case _k
          when 'likes'        then coalesce(la.c, 0)
          when 'comments'     then coalesce(ca.c, 0)
          when 'interactions' then coalesce(la.c, 0) + coalesce(ca.c, 0)
          else coalesce(la.c, 0)
        end as sc
      from public.posts po
      left join likes_agg    la on la.post_id = po.id
      left join comments_agg ca on ca.post_id = po.id
      where po.created_at >= _since
        and coalesce(po.is_hidden, false) = false
        and coalesce(po.is_deleted, false) = false
    )
  select cb.pid, cb.uid, cb.sc,
         p.full_name, p.username, p.avatar, p.vip_level
  from combined cb
  join public.profiles p on p.id = cb.uid
  where cb.sc > 0
    and coalesce(p.is_banned, false) = false
    and coalesce(p.account_status, 'active') = 'active'
  order by cb.sc desc, cb.pid
  limit 50;
end;
$$;

grant execute on function public.leaderboard_posts(text, text) to anon, authenticated, service_role;

-- Nếu bảng posts KHÔNG có is_deleted, tạo alias không dùng cột đó.
-- (idempotent fallback dùng function overload; nếu column tồn tại thì bản trên hoạt động,
-- nếu không tồn tại, gọi sẽ lỗi tại runtime → nên đảm bảo cột có sẵn. Migration cũ đã
-- thêm is_hidden. Nếu thiếu is_deleted, ta thêm mặc định false để không phá luồng cũ.)
do $$ begin
  if to_regclass('public.posts') is not null then
    begin
      execute 'alter table public.posts add column if not exists is_deleted boolean not null default false';
    exception when others then null;
    end;
  end if;
end $$;

-- 6) RPC: leaderboard_users(kind) -------------------------------------------
--    kind: 'reputation' | 'vip' | 'candy' | 'gem'
create or replace function public.leaderboard_users(_kind text default 'reputation')
returns table (
  user_id uuid,
  score numeric,
  full_name text,
  username text,
  avatar text,
  vip_level int,
  reputation_score int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare _k text := lower(coalesce(_kind, 'reputation'));
begin
  return query
  select p.id,
    case _k
      when 'reputation' then coalesce(p.reputation_score, 0)::numeric
      when 'vip'        then coalesce(p.vip_level, 0)::numeric
      when 'candy'      then coalesce((to_jsonb(p) ->> 'candy_balance')::numeric, 0)
      when 'gem'        then coalesce(p.gem_balance, 0)::numeric
      else coalesce(p.reputation_score, 0)::numeric
    end as sc,
    p.full_name, p.username, p.avatar,
    p.vip_level, p.reputation_score
  from public.profiles p
  where coalesce(p.is_banned, false) = false
    and coalesce(p.account_status, 'active') = 'active'
  order by sc desc nulls last, p.id
  limit 50;
end;
$$;

grant execute on function public.leaderboard_users(text) to anon, authenticated, service_role;

-- 7) Realtime — bật publication cho các bảng nguồn (idempotent, không phá cũ) --
do $$
declare _tbl text;
begin
  foreach _tbl in array array['follows','post_likes','comments','posts','profiles']
  loop
    if to_regclass('public.'||_tbl) is not null then
      begin
        execute format('alter publication supabase_realtime add table public.%I', _tbl);
      exception
        when duplicate_object then null;
        when others then null;
      end;
    end if;
  end loop;
end $$;

-- 8) RLS — các function trên là SECURITY DEFINER, KHÔNG cần table mới.
--    Các bảng nguồn đã có RLS/grants riêng — không đụng.
-- =====================================================================
-- Kiểm thử nhanh:
--   select * from public.leaderboard_follow('today');
--   select * from public.leaderboard_follow('week');
--   select * from public.leaderboard_posts('likes','all');
--   select * from public.leaderboard_posts('comments','week');
--   select * from public.leaderboard_posts('interactions','month');
--   select * from public.leaderboard_users('reputation');
--   select * from public.leaderboard_users('vip');
--   select * from public.leaderboard_users('gem');
-- =====================================================================
