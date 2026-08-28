-- Supabase #3 — mở đường cho CHAT chạy 100% trên #3 bằng publishable/anon key.
--
-- Bối cảnh: người dùng đăng nhập ở Supabase #1 (ES256 + kid) nên #3 KHÔNG thể
-- xác thực token của #1 (PGRST301). Đến khi #3 được bật Third-Party Auth trỏ
-- JWKS của #1, client #3 chỉ có thể dùng anon key → cần policy cho role `anon`.
--
-- Lưu ý bảo mật: các policy `anon` dưới đây cho phép đọc/ghi bảng chat bằng
-- publishable key (giống `chat_partners` đã làm trước đó). Sau khi bật
-- Third-Party Auth ở #3, hãy DROP các policy `*_anon_bridge` và đặt
-- VITE_LOGS_FORWARD_AUTH=1 để quay lại RLS theo auth.uid().

-- messages -----------------------------------------------------------------
grant select, insert, update, delete on public.messages to anon;
grant all on public.messages to service_role;

drop policy if exists messages_select_anon_bridge on public.messages;
create policy messages_select_anon_bridge on public.messages for select to anon using (true);

drop policy if exists messages_insert_anon_bridge on public.messages;
create policy messages_insert_anon_bridge on public.messages for insert to anon with check (true);

drop policy if exists messages_update_anon_bridge on public.messages;
create policy messages_update_anon_bridge on public.messages for update to anon using (true) with check (true);

drop policy if exists messages_delete_anon_bridge on public.messages;
create policy messages_delete_anon_bridge on public.messages for delete to anon using (true);

-- message_reactions --------------------------------------------------------
grant select, insert, update, delete on public.message_reactions to anon;
grant all on public.message_reactions to service_role;

drop policy if exists reactions_anon_bridge on public.message_reactions;
create policy reactions_anon_bridge on public.message_reactions for all to anon using (true) with check (true);

-- conversation_clears ------------------------------------------------------
grant select, insert, update, delete on public.conversation_clears to anon;
grant all on public.conversation_clears to service_role;

drop policy if exists clears_anon_bridge on public.conversation_clears;
create policy clears_anon_bridge on public.conversation_clears for all to anon using (true) with check (true);

-- Realtime -----------------------------------------------------------------
alter table public.messages replica identity full;
alter table public.message_reactions replica identity full;
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.messages'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.message_reactions'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.conversation_clears'; exception when others then null; end;
end $$;
