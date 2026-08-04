-- Global anti-spam / rate limiting system.
-- Run this ONCE against the project's Supabase database
-- (SQL editor → paste → run). Safe to re-run.
--
-- Provides a reusable PostgreSQL-backed rate limiter that any sensitive
-- action can call before performing writes. Backend is the source of truth;
-- the frontend performs the same check for immediate feedback.
--
-- Usage from a client (via RPC):
--   select public.check_rate_limit('chat');           -- uses caller's auth.uid()
--   select public.check_rate_limit('like', 5, 5);     -- override limit/window

create table if not exists public.rate_limit_hits (
  id           bigserial primary key,
  user_id      uuid not null,
  action       text not null,
  hit_at       timestamptz not null default now()
);

create index if not exists rate_limit_hits_user_action_time_idx
  on public.rate_limit_hits (user_id, action, hit_at desc);

grant select, insert, delete on public.rate_limit_hits to authenticated;
grant all on public.rate_limit_hits to service_role;
grant usage, select on sequence public.rate_limit_hits_id_seq to authenticated;

alter table public.rate_limit_hits enable row level security;

drop policy if exists rate_limit_hits_self_select on public.rate_limit_hits;
create policy rate_limit_hits_self_select
  on public.rate_limit_hits for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rate_limit_hits_self_insert on public.rate_limit_hits;
create policy rate_limit_hits_self_insert
  on public.rate_limit_hits for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Configurable defaults. Update this function to tune limits without touching
-- application code. Each entry is (max_hits, window_seconds).
create or replace function public.rate_limit_defaults(_action text)
returns table(max_hits int, window_seconds int)
language sql
immutable
as $$
  select
    case lower(_action)
      when 'chat'           then 5
      when 'bet'            then 3
      when 'like'           then 5
      when 'reaction'       then 5
      when 'follow'         then 10
      when 'post'           then 3
      when 'comment'        then 3
      when 'friend_request' then 5
      when 'notification'   then 10
      else 5
    end as max_hits,
    case lower(_action)
      when 'chat'           then 5
      when 'bet'            then 5
      when 'like'           then 5
      when 'reaction'       then 5
      when 'follow'         then 60
      when 'post'           then 30
      when 'comment'        then 30
      when 'friend_request' then 60
      when 'notification'   then 30
      else 10
    end as window_seconds;
$$;

-- Main entry point. Raises SQLSTATE 'P0001' with a Vietnamese message when
-- the caller has exceeded the limit for `_action` in the last window.
create or replace function public.check_rate_limit(
  _action          text,
  _max_hits        int default null,
  _window_seconds  int default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_max    int;
  v_window int;
  v_count  int;
begin
  if v_user is null then
    -- Unauthenticated callers cannot spam DB writes (RLS blocks them).
    return true;
  end if;

  select coalesce(_max_hits, d.max_hits),
         coalesce(_window_seconds, d.window_seconds)
    into v_max, v_window
    from public.rate_limit_defaults(_action) d;

  select count(*)
    into v_count
    from public.rate_limit_hits
   where user_id = v_user
     and action  = _action
     and hit_at  > now() - make_interval(secs => v_window);

  if v_count >= v_max then
    raise exception 'Bạn đang thao tác quá nhanh. Vui lòng đợi 5–10 giây rồi thử lại.'
      using errcode = 'P0001';
  end if;

  insert into public.rate_limit_hits(user_id, action) values (v_user, _action);

  -- Opportunistic cleanup: keep the table small.
  delete from public.rate_limit_hits
   where user_id = v_user
     and action  = _action
     and hit_at  < now() - make_interval(secs => greatest(v_window * 4, 300));

  return true;
end;
$$;

grant execute on function public.check_rate_limit(text, int, int) to authenticated;
grant execute on function public.rate_limit_defaults(text) to authenticated;
