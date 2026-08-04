-- ============================================================
-- TUỲ CHỌN: chạy file này trong SQL Editor của Supabase nếu DB
-- chưa có sẵn các RPC bên dưới. Không đụng tới URL/API key/RLS.
-- Ứng dụng vẫn chạy được khi thiếu (đã có fallback phía client),
-- riêng Export/Import backup thì cần 2 hàm đầu tiên.
-- ============================================================

-- 1) Export toàn bộ dữ liệu ra JSON (chỉ admin)
create or replace function public.admin_export_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  t text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'forbidden';
  end if;

  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format(
      'select $1 || jsonb_build_object(%L, coalesce((select jsonb_agg(to_jsonb(x)) from public.%I x), ''[]''::jsonb))',
      t, t
    ) into result using result;
  end loop;

  return result;
end;
$$;

-- 2) Import (khôi phục) dữ liệu từ payload JSON của hàm export
create or replace function public.admin_import_all_data(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  restored text[] := '{}';
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'forbidden';
  end if;

  for t in select jsonb_object_keys(_payload) loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t and table_type = 'BASE TABLE'
    ) then
      begin
        execute format(
          'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
          t, t
        ) using _payload -> t;
        restored := restored || t;
      exception when others then
        -- bỏ qua bảng lỗi để không chặn toàn bộ quá trình khôi phục
        null;
      end;
    end if;
  end loop;

  return jsonb_build_object('restored', to_jsonb(restored));
end;
$$;

-- 3) Xoá toàn bộ nội dung của 1 tài khoản (giữ tài khoản)
create or replace function public.admin_wipe_user_content(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_posts int := 0;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'forbidden';
  end if;

  delete from public.likes where post_id in (select id from public.posts where user_id = p_user_id);
  delete from public.comments where post_id in (select id from public.posts where user_id = p_user_id);
  delete from public.comments where user_id = p_user_id;
  delete from public.likes where user_id = p_user_id;
  delete from public.messages where sender_id = p_user_id;
  delete from public.posts where user_id = p_user_id;
  get diagnostics deleted_posts = row_count;

  return jsonb_build_object('deleted_posts', deleted_posts);
end;
$$;

-- 4) Xoá toàn bộ bài viết trong hệ thống
create or replace function public.admin_delete_all_posts(_confirm text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'forbidden';
  end if;
  if _confirm is distinct from 'DELETE ALL POSTS' then
    raise exception 'confirmation_required';
  end if;

  delete from public.likes where true;
  delete from public.comments where true;
  delete from public.posts where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.admin_export_all_data() to authenticated;
grant execute on function public.admin_import_all_data(jsonb) to authenticated;
grant execute on function public.admin_wipe_user_content(uuid) to authenticated;
grant execute on function public.admin_delete_all_posts(text) to authenticated;

-- 5) Sửa lỗi log bộ lọc từ cấm: keyword_logs.keyword NOT NULL nhưng RPC
--    moderate_content không truyền giá trị -> lỗi SQL lộ ra người dùng.
alter table if exists public.keyword_logs alter column keyword drop not null;
