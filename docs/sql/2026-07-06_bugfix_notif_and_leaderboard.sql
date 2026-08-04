-- =====================================================================
-- BUGFIX 2026-07-06 — 3 lỗi phát hiện sau Task #3 + Task #4
--   Bug 1: notif_insert_single / notif_upsert_agg gặp lỗi
--          "no unique or exclusion constraint matching the ON CONFLICT"
--          vì unique index là PARTIAL INDEX. Postgres cần WHERE trong
--          ON CONFLICT khớp với predicate của partial index.
--
--   Bug 2: leaderboard_posts() đọc public.post_likes, nhưng project
--          đang dùng public.likes → không có dữ liệu. Đồng thời
--          likes_agg / comments_agg thiếu lọc created_at >= today.
--
--   Bug 3: leaderboard_users() ('Tương tác') cũng đọc public.post_likes
--          → điểm = 0 → UI hiện "Chưa có dữ liệu".
--
-- CHỈ CREATE OR REPLACE. KHÔNG DROP TABLE. KHÔNG SỬA DỮ LIỆU.
-- Idempotent — chạy nhiều lần vẫn OK.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bug 1: sửa ON CONFLICT để khớp với partial unique index
--   uniq_notifications_agg đang là:
--     CREATE UNIQUE INDEX ... (user_id, kind, entity_type, entity_id)
--     WHERE kind IS NOT NULL
--       AND entity_type IS NOT NULL
--       AND entity_id  IS NOT NULL;
--   → ON CONFLICT phải có cùng WHERE mới match được.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notif_upsert_agg(
  p_user_id     uuid,
  p_kind        text,
  p_entity_type text,
  p_entity_id   text,
  p_actor_id    uuid,
  p_data        jsonb,
  p_link        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_actor_id IS NULL OR p_user_id = p_actor_id THEN
    RETURN;
  END IF;
  IF p_kind IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
    -- Không thể dùng partial unique index nếu thiếu 1 trong 3 field.
    RETURN;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, kind, entity_type, entity_id,
     actor_ids, actors_count, last_actor_id,
     data, link, is_read, created_at, updated_at)
  VALUES
    (p_user_id, p_kind, p_kind, p_entity_type, p_entity_id,
     ARRAY[p_actor_id]::uuid[], 1, p_actor_id,
     COALESCE(p_data, '{}'::jsonb) || jsonb_build_object('actor_id', p_actor_id),
     p_link, false, now(), now())
  ON CONFLICT (user_id, kind, entity_type, entity_id)
  WHERE kind IS NOT NULL
    AND entity_type IS NOT NULL
    AND entity_id  IS NOT NULL
  DO UPDATE SET
    actor_ids = CASE
      WHEN p_actor_id = ANY(public.notifications.actor_ids)
        THEN public.notifications.actor_ids
      ELSE array_prepend(p_actor_id,
             public.notifications.actor_ids[1:49])
      END,
    actors_count = CASE
      WHEN p_actor_id = ANY(public.notifications.actor_ids)
        THEN public.notifications.actors_count
      ELSE public.notifications.actors_count + 1
      END,
    last_actor_id = p_actor_id,
    data = COALESCE(public.notifications.data, '{}'::jsonb)
           || COALESCE(p_data, '{}'::jsonb)
           || jsonb_build_object('actor_id', p_actor_id),
    link = COALESCE(p_link, public.notifications.link),
    is_read = false,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.notif_upsert_agg(uuid,text,text,text,uuid,jsonb,text)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.notif_insert_single(
  p_user_id     uuid,
  p_kind        text,
  p_entity_type text,
  p_entity_id   text,
  p_actor_id    uuid,
  p_title       text,
  p_message     text,
  p_data        jsonb,
  p_link        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF p_actor_id IS NOT NULL AND p_actor_id = p_user_id THEN RETURN; END IF;

  IF p_kind IS NOT NULL
     AND p_entity_type IS NOT NULL
     AND p_entity_id  IS NOT NULL THEN
    -- Có đủ 3 field → dùng partial unique index để dedup.
    INSERT INTO public.notifications
      (user_id, type, kind, entity_type, entity_id,
       actor_ids, actors_count, last_actor_id,
       title, message, data, link, is_read, created_at, updated_at)
    VALUES
      (p_user_id, p_kind, p_kind, p_entity_type, p_entity_id,
       CASE WHEN p_actor_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_actor_id]::uuid[] END,
       CASE WHEN p_actor_id IS NULL THEN 0 ELSE 1 END,
       p_actor_id,
       p_title, p_message,
       COALESCE(p_data, '{}'::jsonb) || jsonb_build_object('actor_id', p_actor_id),
       p_link, false, now(), now())
    ON CONFLICT (user_id, kind, entity_type, entity_id)
    WHERE kind IS NOT NULL
      AND entity_type IS NOT NULL
      AND entity_id  IS NOT NULL
    DO NOTHING;
  ELSE
    -- Thiếu field → không thể dedup, insert thẳng.
    INSERT INTO public.notifications
      (user_id, type, kind, entity_type, entity_id,
       actor_ids, actors_count, last_actor_id,
       title, message, data, link, is_read, created_at, updated_at)
    VALUES
      (p_user_id, p_kind, p_kind, p_entity_type, p_entity_id,
       CASE WHEN p_actor_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_actor_id]::uuid[] END,
       CASE WHEN p_actor_id IS NULL THEN 0 ELSE 1 END,
       p_actor_id,
       p_title, p_message,
       COALESCE(p_data, '{}'::jsonb) || jsonb_build_object('actor_id', p_actor_id),
       p_link, false, now(), now());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notif_insert_single(uuid,text,text,text,uuid,text,text,jsonb,text)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- Bug 2: leaderboard_posts → dùng đúng bảng public.likes + lọc today
-- ---------------------------------------------------------------------
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
  _likes_tbl text := case
    when to_regclass('public.likes') is not null then 'public.likes'
    when to_regclass('public.post_likes') is not null then 'public.post_likes'
    else null
  end;
  _sql text;
begin
  if _k not in ('likes', 'comments') then
    _k := 'likes';
  end if;

  _sql := format($q$
    with
      likes_agg as (
        select post_id, count(*)::bigint as c
        from %s
        where %L = 'likes'
          and created_at >= %L
        group by post_id
      ),
      comments_agg as (
        select post_id, count(*)::bigint as c
        from public.comments
        where %L = 'comments'
          and created_at >= %L
        group by post_id
      ),
      combined as (
        select po.id as pid, po.user_id as uid,
          case %L
            when 'likes'    then coalesce(la.c, 0)
            when 'comments' then coalesce(ca.c, 0)
            else 0::bigint
          end as sc
        from public.posts po
        left join likes_agg    la on la.post_id = po.id
        left join comments_agg ca on ca.post_id = po.id
        where po.created_at >= %L
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
    limit 50
  $q$,
    coalesce(_likes_tbl, 'public.likes'),
    _k, _since,
    _k, _since,
    _k,
    _since
  );

  return query execute _sql;
end;
$$;

grant execute on function public.leaderboard_posts(text, text)
  to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- Bug 3: leaderboard_users (Tương tác) → dùng đúng public.likes
-- ---------------------------------------------------------------------
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
  _likes_tbl text := case
    when to_regclass('public.likes') is not null then 'public.likes'
    when to_regclass('public.post_likes') is not null then 'public.post_likes'
    else null
  end;
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
      )
      $q$;

  if _likes_tbl is not null then
    _sql := _sql || format($q$,
      likes_pts as (
        select user_id as uid, (count(*) * 1)::numeric as pts
        from %s
        group by user_id
      )
    $q$, _likes_tbl);
  end if;

  _sql := _sql || $q$,
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
      $q$
    || case when _likes_tbl is not null then ' union all select uid, pts from likes_pts ' else '' end
    || $q$
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

grant execute on function public.leaderboard_users(text)
  to anon, authenticated, service_role;

-- =====================================================================
-- Kiểm thử:
--   -- Bug 1: comment không còn văng lỗi ON CONFLICT
--   select public.notif_insert_single(
--     '00000000-0000-0000-0000-000000000000'::uuid,
--     'comment', 'post', gen_random_uuid()::text,
--     null, 'test','test', '{}'::jsonb, null);
--
--   -- Bug 2 & 3:
--   select * from public.leaderboard_posts('likes');
--   select * from public.leaderboard_posts('comments');
--   select * from public.leaderboard_users('activity');
--   select * from public.leaderboard_activity();
-- =====================================================================
