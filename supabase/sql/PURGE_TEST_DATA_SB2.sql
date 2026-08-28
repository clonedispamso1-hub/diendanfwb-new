-- ============================================================================
-- DỌN DỮ LIỆU TEST — SUPABASE #2 (media / Live Móc / Cộng Đồng VIP)
-- Chạy trong SQL Editor của project SB2 (pymwwuscoftmdcmmeckp).
--
-- Xoá dữ liệu media & VIP phát sinh trong lúc test. Giữ schema, RPC, trigger,
-- bucket và cấu hình. File trong Storage: xoá thủ công ở tab Storage nếu cần.
-- ============================================================================

begin;

do $$
declare
  t text;
  tables text[] := array[
    'live_moc_messages','live_moc_gifts','live_moc_viewers','live_moc_sessions',
    'live_users','vip_community_comments','vip_community_likes',
    'vip_community_posts','vip_media','media_library','uploads',
    'feedback_attachments','feedback','voice_messages','video_uploads'
  ];
begin
  for i in 1..2 loop
    foreach t in array tables loop
      if exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name=t and table_type='BASE TABLE') then
        begin
          execute format('delete from public.%I where true', t);
        exception when others then null;
        end;
      end if;
    end loop;
  end loop;
end $$;

commit;

-- KIỂM TRA nhanh: liệt kê số dòng còn lại của các bảng public
select table_name,
       (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from public.%I', table_name),
                      false, true, '')))[1]::text::int as rows_left
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE'
order by rows_left desc;
