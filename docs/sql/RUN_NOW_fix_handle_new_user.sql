-- =====================================================================
-- FIX DỨT ĐIỂM: "Database error saving new user" (SQLSTATE 23502)
--   null value in column "public_id" of relation "profiles"
--
-- Nguyên nhân: trigger on_auth_user_created chạy handle_new_user() để
-- INSERT vào public.profiles nhưng KHÔNG truyền public_id, trong khi
-- profiles.public_id là NOT NULL và default đã bị xoá.
--
-- Script này làm 3 việc, an toàn chạy lại nhiều lần:
--   1) Bảo đảm hàm sinh public_id + trigger BEFORE INSERT + DEFAULT.
--   2) REWRITE handle_new_user() → insert đầy đủ, KHÔNG đụng public_id
--      (để DEFAULT/trigger tự sinh) và ON CONFLICT DO NOTHING.
--   3) Bảo đảm trigger on_auth_user_created gắn đúng vào auth.users.
--
-- Chạy TOÀN BỘ file trong Supabase SQL Editor. Sau đó thử signup 5 tài
-- khoản liên tiếp — không còn lỗi 23502.
-- =====================================================================

-- 1) Hàm sinh public_id (6 ký tự, không trùng) ------------------------
create or replace function public.gen_profile_public_id()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where public_id = candidate);
  end loop;
  return candidate;
end;
$$;

grant execute on function public.gen_profile_public_id() to authenticated, service_role;

-- Backfill + DEFAULT + NOT NULL + UNIQUE
update public.profiles
   set public_id = public.gen_profile_public_id()
 where public_id is null or btrim(public_id) = '';

alter table public.profiles
  alter column public_id set default public.gen_profile_public_id(),
  alter column public_id set not null;

create unique index if not exists profiles_public_id_key
  on public.profiles (public_id);

-- Trigger BEFORE INSERT tự điền public_id nếu ai đó insert NULL/''
create or replace function public.set_profile_public_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.public_id is null or btrim(NEW.public_id) = '' then
    NEW.public_id := public.gen_profile_public_id();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_set_profile_public_id on public.profiles;
create trigger trg_set_profile_public_id
  before insert on public.profiles
  for each row execute function public.set_profile_public_id();

-- 2) REWRITE handle_new_user() ---------------------------------------
-- Chỉ insert các cột chắc chắn có trong bảng profiles. Bỏ qua public_id
-- để DEFAULT/trigger sinh. Bọc trong exception handler để signup KHÔNG
-- bao giờ fail vì profile — auth.users vẫn được tạo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_full_name text;
  v_avatar text;
begin
  v_username := coalesce(
    NEW.raw_user_meta_data->>'username',
    split_part(coalesce(NEW.email, NEW.id::text), '@', 1)
  );
  v_full_name := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    v_username
  );
  v_avatar := NEW.raw_user_meta_data->>'avatar_url';

  begin
    insert into public.profiles (id, username, full_name, avatar)
    values (NEW.id, v_username, v_full_name, v_avatar)
    on conflict (id) do nothing;
  exception when unique_violation then
    -- username đã tồn tại → thêm hậu tố ngẫu nhiên
    insert into public.profiles (id, username, full_name, avatar)
    values (
      NEW.id,
      v_username || '_' || substr(md5(random()::text), 1, 6),
      v_full_name,
      v_avatar
    )
    on conflict (id) do nothing;
  when others then
    -- Không chặn signup vì bất cứ lỗi nào của profile
    raise warning 'handle_new_user failed for %: % / %', NEW.id, sqlstate, sqlerrm;
  end;

  return NEW;
end;
$$;

-- 3) Gắn trigger vào auth.users --------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Verify -----------------------------------------------------------
select column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='profiles' and column_name='public_id';

select tgname, tgrelid::regclass as table_name
  from pg_trigger
 where tgname in ('on_auth_user_created','trg_set_profile_public_id');
