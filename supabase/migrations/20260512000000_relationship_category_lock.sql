-- ============================================================
-- Relationship Category 24h lock
-- Tracks the user's currently locked posting category (FWB / ONS / Love)
-- so subsequent posts within 24h reuse the same category automatically.
-- ============================================================

alter table public.profiles
  add column if not exists last_relationship_category text,
  add column if not exists category_locked_until timestamptz;

create or replace function public.set_relationship_category_with_lock(p_category text)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_until timestamptz;
  v_new_until timestamptz;
  v_current text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_category not in ('fwb','ons','love') then raise exception 'INVALID_CATEGORY'; end if;

  select category_locked_until, last_relationship_category
    into v_until, v_current
    from public.profiles where id = v_uid;

  if v_until is not null and v_until > now() then
    if v_current is not null and v_current <> p_category then
      raise exception 'CATEGORY_LOCKED_UNTIL:%', v_until;
    end if;
    return v_until;
  end if;

  v_new_until := now() + interval '24 hours';
  update public.profiles
     set last_relationship_category = p_category,
         category_locked_until = v_new_until,
         intent = p_category,
         intent_locked_until = v_new_until
   where id = v_uid;
  return v_new_until;
end;
$$;

grant execute on function public.set_relationship_category_with_lock(text) to authenticated;
