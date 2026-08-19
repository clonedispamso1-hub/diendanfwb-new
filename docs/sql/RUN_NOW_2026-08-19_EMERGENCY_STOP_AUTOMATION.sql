-- =====================================================================
-- EMERGENCY: DỪNG TOÀN BỘ AUTOMATION + GIẢI PHÓNG CONNECTION
-- Project: zbuwddjcqdlyijcunwgd  (KHÔNG đổi project / URL / API key)
--
-- CÁCH DÙNG (theo đúng thứ tự):
--   0. Dashboard > Settings > General > Restart project  (đợi ~2 phút)
--   1. Mở SQL Editor, chạy NGAY KHỐI A (chỉ vài chục ms) — tắt hết pg_cron.
--   2. Chạy KHỐI B để xem ai đang chiếm connection, KHỐI C để kill.
--   3. Chạy KHỐI D (chẩn đoán) rồi gửi kết quả lại.
--   4. Chỉ khi DB đã ổn định mới chạy KHỐI E để bật lại từng job với
--      tần suất thấp hơn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- KHỐI A — TẮT NGAY mọi job pg_cron (rất nhẹ, chạy được cả khi DB tải cao)
-- ---------------------------------------------------------------------
SELECT cron.unschedule(jobid) FROM cron.job WHERE active;
-- Kiểm tra: phải trả về 0 dòng active
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;

-- ---------------------------------------------------------------------
-- KHỐI B — Ai đang chiếm connection / query nào đang treo
-- ---------------------------------------------------------------------
SELECT count(*) AS total,
       count(*) FILTER (WHERE state = 'active')              AS active,
       count(*) FILTER (WHERE state = 'idle')                AS idle,
       count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx
  FROM pg_stat_activity WHERE datname = current_database();

SELECT usename, application_name, state, count(*)
  FROM pg_stat_activity WHERE datname = current_database()
 GROUP BY 1,2,3 ORDER BY 4 DESC;

SELECT pid, usename, application_name, state,
       now() - query_start AS running_for,
       wait_event_type, wait_event, left(query, 160) AS query
  FROM pg_stat_activity
 WHERE datname = current_database() AND state <> 'idle'
 ORDER BY query_start
 LIMIT 50;

-- ---------------------------------------------------------------------
-- KHỐI C — Kill các phiên treo (an toàn: chỉ phiên > 2 phút, không phải mình)
-- ---------------------------------------------------------------------
SELECT pg_terminate_backend(pid), left(query,80)
  FROM pg_stat_activity
 WHERE datname = current_database()
   AND pid <> pg_backend_pid()
   AND (
        (state = 'active'              AND now() - query_start  > interval '2 minutes')
     OR (state = 'idle in transaction' AND now() - state_change > interval '2 minutes')
   );

-- ---------------------------------------------------------------------
-- KHỐI D — CHẨN ĐOÁN (gửi lại kết quả)
-- ---------------------------------------------------------------------
-- D1. Job cron + 30 lần chạy gần nhất (thời lượng, lỗi)
SELECT j.jobname, r.status, r.start_time, r.end_time,
       r.end_time - r.start_time AS duration, left(r.return_message,120) AS msg
  FROM cron.job_run_details r JOIN cron.job j ON j.jobid = r.jobid
 ORDER BY r.start_time DESC LIMIT 30;

-- D2. Job nào chạy lâu/thường xuyên nhất (24h)
SELECT j.jobname, count(*) AS runs,
       avg(r.end_time - r.start_time) AS avg_dur,
       max(r.end_time - r.start_time) AS max_dur,
       count(*) FILTER (WHERE r.status <> 'succeeded') AS failed
  FROM cron.job_run_details r JOIN cron.job j ON j.jobid = r.jobid
 WHERE r.start_time > now() - interval '24 hours'
 GROUP BY 1 ORDER BY avg_dur DESC NULLS LAST;

-- D3. Query tốn tài nguyên nhất
SELECT calls, round(total_exec_time)::bigint AS total_ms,
       round(mean_exec_time)::bigint AS mean_ms, rows,
       left(query, 140) AS query
  FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

-- D4. Tồn đọng hàng đợi automation (nguồn gây flood)
SELECT 'scheduled_tasks'    AS q, status, count(*) FROM public.scheduled_tasks    GROUP BY 1,2
UNION ALL SELECT 'clone_follow_tasks', status, count(*) FROM public.clone_follow_tasks GROUP BY 1,2
UNION ALL SELECT 'bot_activity_queue', status, count(*) FROM public.bot_activity_queue GROUP BY 1,2
 ORDER BY 1,2;

-- D5. Bảng phình / bloat
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum
  FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 20;

-- D6. Lock chặn nhau
SELECT bl.pid AS blocked, ka.pid AS blocking,
       left(bl_a.query,80) AS blocked_q, left(ka.query,80) AS blocking_q
  FROM pg_locks bl
  JOIN pg_stat_activity bl_a ON bl_a.pid = bl.pid
  JOIN pg_locks kl ON kl.transactionid = bl.transactionid AND kl.pid <> bl.pid
  JOIN pg_stat_activity ka ON ka.pid = kl.pid
 WHERE NOT bl.granted;

-- ---------------------------------------------------------------------
-- KHỐI E — BẬT LẠI CÓ KIỂM SOÁT (chỉ khi DB đã ổn định)
-- Nguyên tắc: giãn tần suất, giảm p_limit, không job nào chạy mỗi phút
-- cùng lúc với job khác.
-- ---------------------------------------------------------------------
-- Dọn hàng đợi tồn đọng trước khi bật lại (tránh cú "dội" hàng chục nghìn task)
-- UPDATE public.scheduled_tasks    SET status='cancelled' WHERE status='pending' AND run_at < now() - interval '1 hour';
-- UPDATE public.clone_follow_tasks SET status='cancelled' WHERE status='pending' AND run_at < now() - interval '1 hour';
-- UPDATE public.bot_activity_queue SET status='cancelled' WHERE status='pending' AND scheduled_for < now() - interval '1 hour';

-- Scheduler chính: 2 phút/lần, limit 50
-- SELECT cron.schedule('scheduler-run-due', '*/2 * * * *', $$SELECT public.scheduler_run_due(50);$$);
-- Follow clone: 5 phút/lần, limit 20
-- SELECT cron.schedule('clone_follow_tick', '*/5 * * * *', $$SELECT public.clone_follow_tick(20);$$);
-- Autopilot clone: 10 phút/lần
-- SELECT cron.schedule('clone_autopilot_tick', '*/10 * * * *', $$SELECT public.admin_autopilot_tick();$$);
-- Hoàn tiền lì xì hết hạn: 5 phút/lần
-- SELECT cron.schedule('refund-expired-lucky-money', '*/5 * * * *', $$SELECT public.refund_expired_lucky_money();$$);
-- Tự nhận bao đỏ rồng: 5 phút/lần
-- SELECT cron.schedule('auto-claim-dragon-envelopes', '*/5 * * * *', $$SELECT public.auto_claim_expired_dragon_envelopes();$$);
-- Dọn thông báo: giữ 1 lần/ngày lúc 3:15
-- SELECT cron.schedule('purge-old-notifications', '15 3 * * *', $$SELECT public.purge_old_notifications();$$);
