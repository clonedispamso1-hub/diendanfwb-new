-- =====================================================================
-- Rising Stars — lifetime capped scoring
-- File: docs/sql/2026-07-15_rising_stars_lifetime_capped.sql
--
-- Rules:
--  • Per post: up to 1000 pts from OTHERS' likes + up to 1000 pts from
--    OTHERS' comments = max 2000 pts per post (lifetime cap, no reset).
--  • Self-likes / self-comments do NOT count.
--  • User score = sum of capped points across all their posts (no limit
--    on number of posts).
--  • Returns TOP 10 users, same column signature as before so the FE
--    (RankingModal) keeps working.
--
-- Idempotent: CREATE OR REPLACE only. No new tables. No DROP.
-- =====================================================================

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
  with per_post as (
    select
      po.id      as post_id,
      po.user_id as author_id,
      least(1000, (
        select count(*) from public.likes pl
        where pl.post_id = po.id and pl.user_id <> po.user_id
      ))::bigint as likes_capped,
      least(1000, (
        select count(*) from public.comments cm
        where cm.post_id = po.id and cm.user_id <> po.user_id
      ))::bigint as comm_capped
    from public.posts po
    where coalesce(po.is_hidden,  false) = false
      and coalesce(po.is_deleted, false) = false
  ),
  per_user as (
    select
      author_id as uid,
      coalesce(sum(likes_capped), 0)::bigint as likes_c,
      coalesce(sum(comm_capped),  0)::bigint as comm_c,
      count(*)::bigint as posts_c
    from per_post
    group by author_id
  ),
  ranked as (
    select
      pu.uid, pu.posts_c, pu.likes_c, pu.comm_c,
      row_number() over (
        order by (pu.likes_c + pu.comm_c) desc, pu.posts_c desc, pu.uid
      ) as rnk
    from per_user pu
    join public.profiles p on p.id = pu.uid
    where (pu.likes_c + pu.comm_c) > 0
      and coalesce(p.is_banned,     false)    = false
      and coalesce(p.account_status,'active') = 'active'
  )
  select
    r.uid,
    r.rnk::int,
    r.likes_c,
    r.comm_c,
    (r.likes_c + r.comm_c)::bigint as total_interactions,
    r.posts_c,
    p.full_name, p.username, p.avatar,
    p.vip_level, p.reputation_score
  from ranked r
  join public.profiles p on p.id = r.uid
  order by r.rnk
  limit 10
$$;

grant execute on function public.leaderboard_active_stars_week()
  to anon, authenticated, service_role;
