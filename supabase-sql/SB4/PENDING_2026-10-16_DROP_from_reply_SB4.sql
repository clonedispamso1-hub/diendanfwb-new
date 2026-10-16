-- =====================================================================
-- ĐỀ XUẤT — GỠ From Reply khỏi SUPABASE #4 (ybzdpxwbpbkeqkqwbscp)
-- CHƯA CHẠY. Chỉ chạy sau khi Admin xem xét. Không dùng CASCADE.
-- Đối tượng lấy từ supabase-sql/SB4/_removed/2026-10-15_from_reply.sql
-- (chưa xác minh trên DB thật vì không có quyền truy cập SB4).
-- =====================================================================

-- ---------- BƯỚC 1: KIỂM TRA (chỉ đọc) ----------
SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'from-reply-tick';
SELECT to_regclass('public.from_reply_config') AS cfg, to_regclass('public.from_reply_state') AS st;
SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'from_reply_%';
-- Phụ thuộc vào 2 bảng (view, FK, function khác…) — kết quả phải rỗng ngoài chính các bảng/index:
SELECT classid::regclass, objid, deptype FROM pg_depend
 WHERE refobjid IN ('public.from_reply_config'::regclass, 'public.from_reply_state'::regclass)
   AND classid <> 'pg_class'::regclass AND deptype <> 'i';
-- Hàm khác có nhắc đến from_reply (phải rỗng):
SELECT p.oid::regprocedure FROM pg_proc p
 WHERE prosrc ILIKE '%from_reply%' AND proname NOT LIKE 'from_reply_%';
-- Số dòng sẽ mất (chỉ là trạng thái đếm 0/2 và mẫu trả lời, không phải tin nhắn):
SELECT (SELECT count(*) FROM public.from_reply_state) AS state_rows,
       (SELECT count(*) FROM public.from_reply_config) AS config_rows;

-- ---------- BƯỚC 2: XÓA (chạy sau khi bước 1 đúng như mong đợi) ----------
BEGIN;
-- 2.1 Dừng cron gọi website
SELECT cron.unschedule('from-reply-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'from-reply-tick');
-- 2.2 Hàm RPC chỉ phục vụ From Reply
DROP FUNCTION IF EXISTS public.from_reply_enqueue(uuid, uuid);
DROP FUNCTION IF EXISTS public.from_reply_claim(int);
DROP FUNCTION IF EXISTS public.from_reply_complete(uuid, uuid, boolean);
-- 2.3 Bảng riêng (index from_reply_state_due_idx tự xóa theo bảng)
DROP TABLE IF EXISTS public.from_reply_state;
DROP TABLE IF EXISTS public.from_reply_config;
-- KHÔNG gỡ extension pg_cron / pg_net: có thể dùng chung.
COMMIT;
NOTIFY pgrst, 'reload schema';

-- ---------- BƯỚC 3: XÁC MINH SAU ----------
SELECT count(*) AS cron_left FROM cron.job WHERE jobname = 'from-reply-tick';
SELECT to_regclass('public.from_reply_config'), to_regclass('public.from_reply_state');
SELECT count(*) AS fn_left FROM pg_proc WHERE proname LIKE 'from_reply_%';
