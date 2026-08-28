-- =============================================================================
-- BUOC 2 (CHAY TREN SUPABASE 1) - CHUYEN DOI SANG BANG NGOAI TRO VE SUPABASE 3
--
-- Sau buoc nay Supabase 1 KHONG con luu du lieu cua 19 bang nang nua,
-- nhung moi RPC / trigger / policy cu van truy van duoc nhu binh thuong
-- (postgres_fdw doc-ghi xuyen sang Supabase 3).
--
-- CHI CHAY KHI DA DOI CHIEU SO BAN GHI 1:1 GIUA HAI DATABASE.
-- Ban goc duoc doi ten thanh <bang>__old_backup, chi xoa han o buoc 3.
-- =============================================================================
SET check_function_bodies = false;

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

DO $$ BEGIN
  CREATE SERVER s3_logs FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host '__S3_HOST__', port '__S3_PORT__', dbname '__S3_DB__', fetch_size '1000', updatable 'true');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE USER MAPPING FOR CURRENT_USER  SERVER s3_logs OPTIONS (user '__S3_USER__', password '__S3_PASSWORD__'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE USER MAPPING FOR postgres      SERVER s3_logs OPTIONS (user '__S3_USER__', password '__S3_PASSWORD__'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE USER MAPPING FOR authenticated SERVER s3_logs OPTIONS (user '__S3_USER__', password '__S3_PASSWORD__'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE USER MAPPING FOR anon          SERVER s3_logs OPTIONS (user '__S3_USER__', password '__S3_PASSWORD__'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE USER MAPPING FOR service_role  SERVER s3_logs OPTIONS (user '__S3_USER__', password '__S3_PASSWORD__'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) Doi ten ban goc (giu lam backup)
ALTER TABLE IF EXISTS public.messages RENAME TO messages__old_backup;
ALTER TABLE IF EXISTS public.message_reactions RENAME TO message_reactions__old_backup;
ALTER TABLE IF EXISTS public.message_gifts RENAME TO message_gifts__old_backup;
ALTER TABLE IF EXISTS public.chat_partners RENAME TO chat_partners__old_backup;
ALTER TABLE IF EXISTS public.conversation_clears RENAME TO conversation_clears__old_backup;
ALTER TABLE IF EXISTS public.group_messages RENAME TO group_messages__old_backup;
ALTER TABLE IF EXISTS public.chat_group_messages RENAME TO chat_group_messages__old_backup;
ALTER TABLE IF EXISTS public.virtual_chat_messages RENAME TO virtual_chat_messages__old_backup;
ALTER TABLE IF EXISTS public.notifications RENAME TO notifications__old_backup;
ALTER TABLE IF EXISTS public.post_views RENAME TO post_views__old_backup;
ALTER TABLE IF EXISTS public.activity_logs RENAME TO activity_logs__old_backup;
ALTER TABLE IF EXISTS public.engagement_points_log RENAME TO engagement_points_log__old_backup;
ALTER TABLE IF EXISTS public.engagement_events RENAME TO engagement_events__old_backup;
ALTER TABLE IF EXISTS public.rate_limit_hits RENAME TO rate_limit_hits__old_backup;
ALTER TABLE IF EXISTS public.keyword_logs RENAME TO keyword_logs__old_backup;
ALTER TABLE IF EXISTS public.member_activity_log RENAME TO member_activity_log__old_backup;
ALTER TABLE IF EXISTS public.group_leave_log RENAME TO group_leave_log__old_backup;
ALTER TABLE IF EXISTS public.group_stats_log RENAME TO group_stats_log__old_backup;
ALTER TABLE IF EXISTS public.spam_detection_logs RENAME TO spam_detection_logs__old_backup;

-- 2) Tao bang ngoai tro sang Supabase 3
IMPORT FOREIGN SCHEMA public LIMIT TO (messages, message_reactions, message_gifts, chat_partners, conversation_clears, group_messages, chat_group_messages, virtual_chat_messages, notifications, post_views, activity_logs, engagement_points_log, engagement_events, rate_limit_hits, keyword_logs, member_activity_log, group_leave_log, group_stats_log, spam_detection_logs)
  FROM SERVER s3_logs INTO public;

-- 3) Bat lai RLS + policy y het ban cu
ALTER FOREIGN TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.message_gifts ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.chat_partners ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.conversation_clears ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.chat_group_messages ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.virtual_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.post_views ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.engagement_points_log ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.keyword_logs ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.member_activity_log ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.group_leave_log ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.group_stats_log ENABLE ROW LEVEL SECURITY;
ALTER FOREIGN TABLE public.spam_detection_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can see all virtual messages" ON public.virtual_chat_messages FOR SELECT USING (true);


CREATE POLICY "Anyone can insert messages" ON public.virtual_chat_messages FOR INSERT WITH CHECK (true);


CREATE POLICY "Enable insert for authenticated users only" ON public.notifications FOR INSERT WITH CHECK (true);


CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);


CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING ((auth.uid() = user_id));


CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


CREATE POLICY "admin read events" ON public.engagement_events FOR SELECT TO authenticated USING (public.is_active_bangchu(auth.uid()));


CREATE POLICY admin_reply_as_virtual_clone ON public.messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = messages.sender_id) AND (p.is_virtual OR p.is_clone OR p.is_seed_account)))) AND public.has_role(auth.uid(), 'admin'::text)));


CREATE POLICY "admins read keyword logs" ON public.keyword_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));


CREATE POLICY block_level3_no_delete ON public.messages AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_hard_banned(auth.uid())));


CREATE POLICY block_level3_no_delete ON public.notifications AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_hard_banned(auth.uid())));


CREATE POLICY block_level3_no_insert ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_hard_banned(auth.uid())));


CREATE POLICY block_level3_no_insert ON public.notifications AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_hard_banned(auth.uid())));


CREATE POLICY block_level3_no_update ON public.messages AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_hard_banned(auth.uid()))) WITH CHECK ((NOT public.is_hard_banned(auth.uid())));


CREATE POLICY block_level3_no_update ON public.notifications AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_hard_banned(auth.uid()))) WITH CHECK ((NOT public.is_hard_banned(auth.uid())));


CREATE POLICY cgmsg_delete_own ON public.chat_group_messages FOR DELETE TO authenticated USING ((sender_id = auth.uid()));


CREATE POLICY conv_clears_delete_own ON public.conversation_clears FOR DELETE TO authenticated USING ((user_id = auth.uid()));


CREATE POLICY conv_clears_insert_own ON public.conversation_clears FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


CREATE POLICY conv_clears_select_own ON public.conversation_clears FOR SELECT TO authenticated USING ((user_id = auth.uid()));


CREATE POLICY conv_clears_update_own ON public.conversation_clears FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


CREATE POLICY group_messages_insert_member ON public.group_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND public.is_group_member(group_id, auth.uid()) AND (public.is_group_owner(group_id, auth.uid()) OR (NOT (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_messages.group_id) AND (g.is_muted = true))))))));


CREATE POLICY group_messages_select_member ON public.group_messages FOR SELECT TO authenticated USING ((public.is_group_member(group_id, auth.uid()) AND (is_archived = false)));


CREATE POLICY group_stats_select_member ON public.group_stats_log FOR SELECT TO authenticated USING (public.is_group_member(group_id, auth.uid()));


CREATE POLICY keyword_logs_admin_read ON public.keyword_logs FOR SELECT TO authenticated USING (public.is_current_user_admin());


CREATE POLICY klog_admin_select ON public.keyword_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));


CREATE POLICY klog_self_insert ON public.keyword_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


CREATE POLICY mal_read ON public.member_activity_log FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.is_admin, false))))));


CREATE POLICY mal_self_insert ON public.member_activity_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


CREATE POLICY "messages participants read" ON public.messages FOR SELECT TO authenticated USING (((sender_id = auth.uid()) OR (receiver_id = auth.uid())));


CREATE POLICY "messages sender insert" ON public.messages FOR INSERT TO authenticated WITH CHECK ((sender_id = auth.uid()));


CREATE POLICY messages_insert_own ON public.messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));


CREATE POLICY messages_insert_self_or_virtual ON public.messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = messages.sender_id) AND (p.is_virtual = true)))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_admin = true) OR (p.role = 'admin'::text)))))));


CREATE POLICY messages_select_own ON public.messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


CREATE POLICY messages_select_self_or_admin ON public.messages FOR SELECT TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_admin = true) OR (p.role = 'admin'::text)))))));


CREATE POLICY messages_update_receiver ON public.messages FOR UPDATE USING ((auth.uid() = receiver_id));


CREATE POLICY msg_gifts_select_own ON public.message_gifts FOR SELECT TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


CREATE POLICY "no client insert" ON public.engagement_points_log FOR INSERT TO authenticated WITH CHECK (false);


CREATE POLICY notif_delete_own ON public.notifications FOR DELETE USING ((auth.uid() = user_id));


CREATE POLICY notif_insert_self ON public.notifications FOR INSERT WITH CHECK ((auth.uid() = user_id));


CREATE POLICY notif_select_own ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


CREATE POLICY notif_update_own ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


CREATE POLICY "own activity insert" ON public.activity_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


CREATE POLICY "own activity read" ON public.activity_logs FOR SELECT USING ((auth.uid() = user_id));


CREATE POLICY "own chat partners delete" ON public.chat_partners FOR DELETE TO authenticated USING ((auth.uid() = user_id));


CREATE POLICY "own chat partners insert" ON public.chat_partners FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


CREATE POLICY "own chat partners select" ON public.chat_partners FOR SELECT TO authenticated USING ((auth.uid() = user_id));


CREATE POLICY "own chat partners update" ON public.chat_partners FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


CREATE POLICY post_views_insert_self ON public.post_views FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


CREATE POLICY post_views_select_all ON public.post_views FOR SELECT TO authenticated USING (true);


CREATE POLICY rate_limit_hits_self_insert ON public.rate_limit_hits FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


CREATE POLICY rate_limit_hits_self_select ON public.rate_limit_hits FOR SELECT TO authenticated USING ((auth.uid() = user_id));


CREATE POLICY reactions_delete_self ON public.message_reactions FOR DELETE TO authenticated USING ((user_id = auth.uid()));


CREATE POLICY reactions_insert_self ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.can_view_message(message_id)));


CREATE POLICY reactions_select_participants ON public.message_reactions FOR SELECT TO authenticated USING (public.can_view_message(message_id));


CREATE POLICY reactions_update_self ON public.message_reactions FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


CREATE POLICY "sender can update own message" ON public.messages FOR UPDATE TO authenticated USING ((auth.uid() = sender_id)) WITH CHECK ((auth.uid() = sender_id));


CREATE POLICY "spam_detection_logs admin read" ON public.spam_detection_logs FOR SELECT USING ((public.has_bot_role(auth.uid(), 'admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'super_admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'bot_manager'::public.bot_role) OR public.has_bot_role(auth.uid(), 'moderator'::public.bot_role) OR public.has_bot_role(auth.uid(), 'reviewer'::public.bot_role)));


CREATE POLICY "spam_detection_logs admin write" ON public.spam_detection_logs USING ((public.has_bot_role(auth.uid(), 'admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'super_admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'bot_manager'::public.bot_role))) WITH CHECK ((public.has_bot_role(auth.uid(), 'admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'super_admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'bot_manager'::public.bot_role)));


CREATE POLICY "users read own points log" ON public.engagement_points_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));


-- 4) Quyen Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
GRANT SELECT ON public.messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
GRANT SELECT ON public.message_reactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_gifts TO authenticated;
GRANT ALL ON public.message_gifts TO service_role;
GRANT SELECT ON public.message_gifts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_partners TO authenticated;
GRANT ALL ON public.chat_partners TO service_role;
GRANT SELECT ON public.chat_partners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_clears TO authenticated;
GRANT ALL ON public.conversation_clears TO service_role;
GRANT SELECT ON public.conversation_clears TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
GRANT SELECT ON public.group_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_group_messages TO authenticated;
GRANT ALL ON public.chat_group_messages TO service_role;
GRANT SELECT ON public.chat_group_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.virtual_chat_messages TO authenticated;
GRANT ALL ON public.virtual_chat_messages TO service_role;
GRANT SELECT ON public.virtual_chat_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT ON public.notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_views TO authenticated;
GRANT ALL ON public.post_views TO service_role;
GRANT SELECT ON public.post_views TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
GRANT SELECT ON public.activity_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_points_log TO authenticated;
GRANT ALL ON public.engagement_points_log TO service_role;
GRANT SELECT ON public.engagement_points_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_events TO authenticated;
GRANT ALL ON public.engagement_events TO service_role;
GRANT SELECT ON public.engagement_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_hits TO authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;
GRANT SELECT ON public.rate_limit_hits TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keyword_logs TO authenticated;
GRANT ALL ON public.keyword_logs TO service_role;
GRANT SELECT ON public.keyword_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_activity_log TO authenticated;
GRANT ALL ON public.member_activity_log TO service_role;
GRANT SELECT ON public.member_activity_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_leave_log TO authenticated;
GRANT ALL ON public.group_leave_log TO service_role;
GRANT SELECT ON public.group_leave_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_stats_log TO authenticated;
GRANT ALL ON public.group_stats_log TO service_role;
GRANT SELECT ON public.group_stats_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spam_detection_logs TO authenticated;
GRANT ALL ON public.spam_detection_logs TO service_role;
GRANT SELECT ON public.spam_detection_logs TO anon;

-- 5) Sau khi chay on dinh vai ngay, bo comment de xoa han ban backup:
-- DROP TABLE IF EXISTS public.messages__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.message_reactions__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.message_gifts__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.chat_partners__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.conversation_clears__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.group_messages__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.chat_group_messages__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.virtual_chat_messages__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.notifications__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.post_views__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.activity_logs__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.engagement_points_log__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.engagement_events__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.rate_limit_hits__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.keyword_logs__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.member_activity_log__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.group_leave_log__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.group_stats_log__old_backup CASCADE;
-- DROP TABLE IF EXISTS public.spam_detection_logs__old_backup CASCADE;
