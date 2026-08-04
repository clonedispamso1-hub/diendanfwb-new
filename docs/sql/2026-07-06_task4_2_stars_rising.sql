-- =====================================================================
-- Task #4.2 — Leaderboard "Ngôi sao đang lên" (Rising Stars)
-- File: docs/sql/2026-07-06_task4_2_stars_rising.sql
--
-- Thay đổi so với Task #4.1:
--  • Không còn score / activity points / hệ số.
--  • Sắp xếp CHỈ theo: total_likes DESC → total_comments DESC → posts_count DESC.
--  • Trả về TOP 10 (thay vì 20).
--  • active_stars_week_detail KHÔNG trả media_urls (schema hiện tại của
--    public.posts không có cột media nào — UI sẽ tự fallback không thumbnail).
--
-- KHÔNG tạo bảng mới. KHÔNG migration phá dữ liệu. KHÔNG DROP.
-- Chỉ CREATE OR REPLACE FUNCTION. Idempotent. Không đụng Task #1/#2/#3.
-- Không đụng leaderboard_follow / notification / chat / wallet.
-- Dùng đúng bảng public.likes (schema hiện tại).
-- =====================================================================

-- 1) Ngôi sao đang lên — TUẦN HIỆN TẠI --------------------------------
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
        and coalesce(po.is_hidden,  false) = false
        and coalesce(po.is_deleted, false) = false
    ),
    per_user as (
      select
        wp.user_id as uid,
        count(distinct wp.id)::bigint as posts_c,
        coalesce(sum((select count(*) from public.likes    pl where pl.post_id = wp.id)), 0)::bigint as likes_c,
        coalesce(sum((select count(*) from public.comments cm where cm.post_id = wp.id)), 0)::bigint as comm_c
      from week_posts wp
      group by wp.user_id
    ),
    ranked as (
      select
        pu.uid, pu.posts_c, pu.likes_c, pu.comm_c,
        row_number() over (
          order by pu.likes_c desc, pu.comm_c desc, pu.posts_c desc, pu.uid
        ) as rnk
      from per_user pu
      join public.profiles p on p.id = pu.uid
      where (pu.likes_c + pu.comm_c) > 0
        and coalesce(p.is_banned,     false)    = false
        and coalesce(p.account_status,'active') = 'active'
    )
  select r.uid,
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
grant execute on function public.leaderboard_active_stars_week() to anon, authenticated, service_role;

-- 2) Detail popup — bài viết của 1 user trong tuần ---------------------
--    LƯU Ý: schema hiện tại của public.posts KHÔNG có cột media nào
--    (không có media_urls / images / photo_urls / video_url / attachments).
--    Vì vậy function chỉ trả về post_id, created_at, content, likes, comments.
--    UI sẽ tự fallback hiển thị bài viết không thumbnail.
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
  select
    po.id,
    po.created_at,
    po.content,
    (select count(*) from public.likes    pl where pl.post_id = po.id)::bigint,
    (select count(*) from public.comments cm where cm.post_id = po.id)::bigint
  from public.posts po, wr
  where po.user_id = _user_id
    and po.created_at >= wr.s
    and po.created_at <  wr.e
    and coalesce(po.is_hidden,  false) = false
    and coalesce(po.is_deleted, false) = false
  order by po.created_at desc
$$;
grant execute on function public.active_stars_week_detail(uuid) to anon, authenticated, service_role;

-- Kiểm thử:
--   select * from public.leaderboard_active_stars_week();
--   select * from public.active_stars_week_detail('<uuid>');