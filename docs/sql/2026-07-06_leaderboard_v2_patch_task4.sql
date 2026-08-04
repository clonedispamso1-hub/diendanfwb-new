-- =====================================================================
-- Leaderboard v2 — PATCH cho Task #4
-- File: docs/sql/2026-07-06_leaderboard_v2_patch_task4.sql
-- =====================================================================
-- Mục tiêu:
--   1) leaderboard_follow: chỉ hôm nay (bất kể _period truyền vào).
--   2) leaderboard_posts:  chỉ hôm nay, chỉ 'likes' | 'comments'
--                          (bỏ 'interactions').
--   3) Thay tab "Người dùng" bằng "Tương tác":
--        - leaderboard_users() → tính điểm hoạt động realtime.
--        - Thêm alias leaderboard_activity() để tương thích.
--
-- KHÔNG DROP TABLE / KHÔNG DROP dữ liệu.
-- KHÔNG rewrite migration cũ. Chỉ CREATE OR REPLACE FUNCTION + ALTER.
-- Idempotent — chạy nhiều lần vẫn OK.
-- =====================================================================

-- 1) leaderboard_follow(_period) → luôn "today" -----------------------------
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
    where f.created_at >= date_trunc('day', now())   -- _period bị bỏ qua: luôn hôm nay
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

-- 2) leaderboard_posts(_kind, _period) → chỉ today, chỉ likes/comments -------
create or replace function public.leaderboard_posts(
  _kind text default 'likes',
  _period text default 'today'
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
  _since timestamptz := date_trunc('day', now());   -- luôn today
  _k text := lower(coalesce(_kind, 'likes'));
begin
  if _k not in ('likes', 'comments') then
    _k := 'likes';  -- fallback: 'interactions' và unknown → likes
  end if;

  return query
  with
    likes_agg as (
      select post_id, count(*)::bigint as c
      from public.post_likes
      where _k = 'likes'
      group by post_id
    ),
    comments_agg as (
      select post_id, count(*)::bigint as c
      from public.comments
      where _k = 'comments'
      group by post_id
    ),
    combined as (
      select po.id as pid, po.user_id as uid,
        case _k
          when 'likes'    then coalesce(la.c, 0)
          when 'comments' then coalesce(ca.c, 0)
          else 0::bigint
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

-- 3) leaderboard_users() → ĐỔI THÀNH "Tương tác" (activity) ------------------
--    Điểm tính realtime từ dữ liệu thật, KHÔNG cache, KHÔNG bảng mới.
--    Mapping điểm:
--        +10  đăng bài (posts)
--        +3   comment
--        +1   like bài
--        +5   follow người khác
--        +2   được follow
--        +1   reaction tin nhắn (message_reactions)   [nếu bảng tồn tại]
--        +4   đăng story                              [nếu bảng tồn tại]
--    Tham số _kind vẫn nhận để giữ compatibility nhưng bị bỏ qua.
create or replace function public.leaderboard_users(_kind text default 'activity')
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
declare
  _has_reactions boolean := to_regclass('public.message_reactions') is not null;
  _has_stories   boolean := to_regclass('public.stories') is not null;
  _sql text;
begin
  _sql := $q$
    with
      posts_pts as (
        select user_id as uid, (count(*) * 10)::numeric as pts
        from public.posts
        where coalesce(is_hidden, false) = false
          and coalesce(is_deleted, false) = false
        group by user_id
      ),
      comments_pts as (
        select user_id as uid, (count(*) * 3)::numeric as pts
        from public.comments
        group by user_id
      ),
      likes_pts as (
        select user_id as uid, (count(*) * 1)::numeric as pts
        from public.post_likes
        group by user_id
      ),
      follow_out_pts as (
        select follower_id as uid, (count(*) * 5)::numeric as pts
        from public.follows
        group by follower_id
      ),
      follow_in_pts as (
        select following_id as uid, (count(*) * 2)::numeric as pts
        from public.follows
        group by following_id
      )
      $q$;

  if _has_reactions then
    _sql := _sql || $q$,
      react_pts as (
        select user_id as uid, (count(*) * 1)::numeric as pts
        from public.message_reactions
        group by user_id
      )
    $q$;
  end if;

  if _has_stories then
    _sql := _sql || $q$,
      stories_pts as (
        select user_id as uid, (count(*) * 4)::numeric as pts
        from public.stories
        group by user_id
      )
    $q$;
  end if;

  _sql := _sql || $q$,
    unioned as (
      select uid, pts from posts_pts
      union all select uid, pts from comments_pts
      union all select uid, pts from likes_pts
      union all select uid, pts from follow_out_pts
      union all select uid, pts from follow_in_pts
      $q$
    || case when _has_reactions then ' union all select uid, pts from react_pts ' else '' end
    || case when _has_stories   then ' union all select uid, pts from stories_pts ' else '' end
    || $q$
    ),
    totals as (
      select uid, sum(pts)::numeric as sc
      from unioned
      where uid is not null
      group by uid
    )
    select p.id, t.sc,
           p.full_name, p.username, p.avatar,
           p.vip_level, p.reputation_score
    from totals t
    join public.profiles p on p.id = t.uid
    where t.sc > 0
      and coalesce(p.is_banned, false) = false
      and coalesce(p.account_status, 'active') = 'active'
    order by t.sc desc, p.id
    limit 50
  $q$;

  return query execute _sql;
end;
$$;

grant execute on function public.leaderboard_users(text) to anon, authenticated, service_role;

-- 3b) Alias tường minh: leaderboard_activity() -------------------------------
create or replace function public.leaderboard_activity()
returns table (
  user_id uuid,
  score numeric,
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
  select * from public.leaderboard_users('activity');
$$;

grant execute on function public.leaderboard_activity() to anon, authenticated, service_role;

-- =====================================================================
-- Kiểm thử nhanh:
--   select * from public.leaderboard_follow();
--   select * from public.leaderboard_posts('likes');
--   select * from public.leaderboard_posts('comments');
--   select * from public.leaderboard_users();      -- = activity
--   select * from public.leaderboard_activity();
-- =====================================================================
