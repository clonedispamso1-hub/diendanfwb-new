-- =====================================================================
-- Task #4.1 — PATCH: dùng đúng bảng public.likes (không phải post_likes)
-- File: docs/sql/2026-07-06_leaderboard_task4_1_PATCH_likes.sql
--
-- Lý do: schema hiện tại của project dùng bảng public.likes
--   (post_id uuid, user_id uuid, created_at timestamptz)
--   — trùng với bảng mà trigger notification hiện tại đang đọc.
-- File Task #4.1 gốc tham chiếu public.post_likes → không tồn tại →
--   ERROR: relation "public.post_likes" does not exist.
--
-- Patch này CHỈ CREATE OR REPLACE 3 function bị ảnh hưởng:
--   - public.leaderboard_posts(text, text)
--   - public.leaderboard_active_stars_week()
--   - public.active_stars_week_detail(uuid)
--
-- KHÔNG tạo bảng mới. KHÔNG rename. KHÔNG sửa migration cũ.
-- KHÔNG đụng dữ liệu. KHÔNG ảnh hưởng Task #1/#2/#3/notification.
-- Idempotent: chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- 2) Posts — Top 20 today, chỉ likes|comments -----------------------------
create or replace function public.leaderboard_posts(
  _kind text default 'likes',
  _period text default 'today'
)
returns table (
  post_id uuid, author_id uuid, score bigint,
  full_name text, username text, avatar text, vip_level int
)
language plpgsql stable security definer set search_path = public
as $$
declare
  _since timestamptz := date_trunc('day', now());
  _k text := lower(coalesce(_kind,'likes'));
begin
  if _k not in ('likes','comments') then _k := 'likes'; end if;

  return query
  with
    likes_agg as (
      select post_id, count(*)::bigint as c
      from public.likes
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
          when 'likes'    then coalesce(la.c,0)
          when 'comments' then coalesce(ca.c,0)
          else 0::bigint
        end as sc
      from public.posts po
      left join likes_agg    la on la.post_id = po.id
      left join comments_agg ca on ca.post_id = po.id
      where po.created_at >= _since
        and coalesce(po.is_hidden,false) = false
        and coalesce(po.is_deleted,false) = false
    )
  select cb.pid, cb.uid, cb.sc,
         p.full_name, p.username, p.avatar, p.vip_level
  from combined cb
  join public.profiles p on p.id = cb.uid
  where cb.sc > 0
    and coalesce(p.is_banned,false) = false
    and coalesce(p.account_status,'active') = 'active'
  order by cb.sc desc, cb.pid
  limit 20;
end;
$$;
grant execute on function public.leaderboard_posts(text, text) to anon, authenticated, service_role;

-- 3) Ngôi sao tích cực — tuần hiện tại ------------------------------------
create or replace function public.leaderboard_active_stars_week()
returns table (
  user_id uuid,
  rank int,
  total_likes bigint,
  total_comments bigint,
  total_interactions bigint,
  posts_count bigint,
  full_name text,
  username text,
  avatar text,
  vip_level int,
  reputation_score int
)
language sql stable security definer set search_path = public
as $$
  with
    week_range as (
      select date_trunc('week', now()) as s,
             date_trunc('week', now()) + interval '7 days' as e
    ),
    week_posts as (
      select po.id, po.user_id
      from public.posts po, week_range wr
      where po.created_at >= wr.s
        and po.created_at <  wr.e
        and coalesce(po.is_hidden,false) = false
        and coalesce(po.is_deleted,false) = false
    ),
    per_user as (
      select
        wp.user_id as uid,
        count(distinct wp.id)::bigint as posts_c,
        coalesce(sum((select count(*) from public.likes    pl where pl.post_id = wp.id)),0)::bigint as likes_c,
        coalesce(sum((select count(*) from public.comments cm where cm.post_id = wp.id)),0)::bigint as comm_c
      from week_posts wp
      group by wp.user_id
    ),
    ranked as (
      select
        pu.uid, pu.posts_c, pu.likes_c, pu.comm_c,
        (pu.likes_c + pu.comm_c) as tot,
        row_number() over (order by (pu.likes_c + pu.comm_c) desc, pu.uid) as rnk
      from per_user pu
      join public.profiles p on p.id = pu.uid
      where (pu.likes_c + pu.comm_c) > 0
        and coalesce(p.is_banned,false) = false
        and coalesce(p.account_status,'active') = 'active'
    )
  select r.uid, r.rnk::int,
         r.likes_c, r.comm_c, r.tot, r.posts_c,
         p.full_name, p.username, p.avatar,
         p.vip_level, p.reputation_score
  from ranked r
  join public.profiles p on p.id = r.uid
  order by r.rnk
  limit 20
$$;
grant execute on function public.leaderboard_active_stars_week() to anon, authenticated, service_role;

-- 4) Detail popup: bài viết của 1 user trong tuần -------------------------
create or replace function public.active_stars_week_detail(_user_id uuid)
returns table (
  post_id uuid,
  created_at timestamptz,
  content text,
  likes bigint,
  comments bigint
)
language sql stable security definer set search_path = public
as $$
  with wr as (
    select date_trunc('week', now()) as s,
           date_trunc('week', now()) + interval '7 days' as e
  )
  select po.id, po.created_at, po.content,
    (select count(*) from public.likes    pl where pl.post_id = po.id)::bigint,
    (select count(*) from public.comments cm where cm.post_id = po.id)::bigint
  from public.posts po, wr
  where po.user_id = _user_id
    and po.created_at >= wr.s
    and po.created_at <  wr.e
    and coalesce(po.is_hidden,false) = false
    and coalesce(po.is_deleted,false) = false
  order by po.created_at desc
$$;
grant execute on function public.active_stars_week_detail(uuid) to anon, authenticated, service_role;

-- Kiểm thử:
--   select * from public.leaderboard_posts('likes');
--   select * from public.leaderboard_posts('comments');
--   select * from public.leaderboard_active_stars_week();
--   select * from public.active_stars_week_detail('<uuid>');