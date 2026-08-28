-- =====================================================================
-- SUPABASE #3 — HÀNG ĐỢI BÌNH LUẬN HÀNG LOẠT (server-side job queue)
-- File: supabase-sql/SB3/2026-08-25-admin-comment-jobs.sql
--
-- Mục tiêu:
--   • admin_comment_jobs: 1 dòng = 1 bình luận cần gửi (có batch_id).
--   • lease/lock: worker thuê job trong N giây, hết hạn tự nhả (không treo).
--   • attempts/max_attempts: retry có giới hạn.
--   • RPC claim/complete IDEMPOTENT: chạy lại không gửi trùng.
--   • admin_job_locks: single-flight — mỗi lúc chỉ 1 worker chạy.
--
-- Chạy file này 1 lần trên Supabase #3 (SQL Editor). Idempotent, chạy lại OK.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1) BẢNG JOB
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_comment_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL,
  post_id       uuid NOT NULL,
  user_id       uuid NOT NULL,             -- tài khoản clone sẽ bình luận
  content       text NOT NULL,
  dedupe_key    text NOT NULL,             -- chống tạo trùng job
  run_at        timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'pending',
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,
  lease_token   uuid,
  lease_until   timestamptz,
  comment_id    uuid,                      -- kết quả -> đảm bảo không gửi trùng
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_comment_jobs
  DROP CONSTRAINT IF EXISTS admin_comment_jobs_status_chk;
ALTER TABLE public.admin_comment_jobs
  ADD CONSTRAINT admin_comment_jobs_status_chk
  CHECK (status IN ('pending', 'running', 'done', 'error', 'canceled'));

CREATE UNIQUE INDEX IF NOT EXISTS admin_comment_jobs_dedupe_uidx
  ON public.admin_comment_jobs (dedupe_key);
CREATE INDEX IF NOT EXISTS admin_comment_jobs_due_idx
  ON public.admin_comment_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS admin_comment_jobs_batch_idx
  ON public.admin_comment_jobs (batch_id, created_at);
CREATE INDEX IF NOT EXISTS admin_comment_jobs_lease_idx
  ON public.admin_comment_jobs (lease_until)
  WHERE status = 'running';

-- ------------------------------------------------------------------
-- 2) BẢNG LOCK (single-flight cho worker)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_job_locks (
  name        text PRIMARY KEY,
  token       uuid,
  lease_until timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------
-- 3) GRANTS (Data API không tự cấp quyền cho public schema)
-- ------------------------------------------------------------------
GRANT SELECT ON public.admin_comment_jobs TO anon, authenticated;
GRANT ALL    ON public.admin_comment_jobs TO service_role;
GRANT ALL    ON public.admin_job_locks    TO service_role;

ALTER TABLE public.admin_comment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_job_locks    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_comment_jobs_read ON public.admin_comment_jobs;
CREATE POLICY admin_comment_jobs_read
  ON public.admin_comment_jobs FOR SELECT
  TO anon, authenticated
  USING (true);
-- Ghi chỉ qua RPC SECURITY DEFINER bên dưới (không có policy INSERT/UPDATE).

-- ------------------------------------------------------------------
-- 4) RPC: TẠO JOB (idempotent theo dedupe_key)
--    p_jobs = jsonb array: [{post_id, user_id, content, run_at, dedupe_key?}]
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_comment_jobs_enqueue(
  p_batch_id uuid,
  p_jobs     jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF p_batch_id IS NULL OR p_jobs IS NULL OR jsonb_typeof(p_jobs) <> 'array' THEN
    RETURN 0;
  END IF;

  WITH src AS (
    SELECT
      (j ->> 'post_id')::uuid AS post_id,
      (j ->> 'user_id')::uuid AS user_id,
      COALESCE(j ->> 'content', '')  AS content,
      COALESCE(NULLIF(j ->> 'run_at', '')::timestamptz, now()) AS run_at,
      COALESCE(
        NULLIF(j ->> 'dedupe_key', ''),
        p_batch_id::text || ':' || ord::text
      ) AS dedupe_key
    FROM jsonb_array_elements(p_jobs) WITH ORDINALITY AS t(j, ord)
  ), ins AS (
    INSERT INTO public.admin_comment_jobs
      (batch_id, post_id, user_id, content, run_at, dedupe_key)
    SELECT p_batch_id, post_id, user_id, content, run_at, dedupe_key
    FROM src
    WHERE post_id IS NOT NULL AND user_id IS NOT NULL AND content <> ''
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_comment_jobs_enqueue(uuid, jsonb)
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- 5) RPC: LOCK SINGLE-FLIGHT CHO WORKER
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_job_lock_acquire(
  p_name text,
  p_ttl_seconds integer DEFAULT 60
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
  v_ok    boolean;
BEGIN
  INSERT INTO public.admin_job_locks (name, token, lease_until, updated_at)
  VALUES (p_name, v_token, now() + make_interval(secs => GREATEST(p_ttl_seconds, 5)), now())
  ON CONFLICT (name) DO UPDATE
    SET token = EXCLUDED.token,
        lease_until = EXCLUDED.lease_until,
        updated_at = now()
    WHERE public.admin_job_locks.lease_until IS NULL
       OR public.admin_job_locks.lease_until < now()
  RETURNING true INTO v_ok;

  IF v_ok IS TRUE THEN
    RETURN v_token;
  END IF;
  RETURN NULL; -- worker khác đang chạy
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_job_lock_release(
  p_name text,
  p_token uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.admin_job_locks
       SET lease_until = now() - interval '1 second', updated_at = now()
     WHERE name = p_name AND token = p_token
     RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

GRANT EXECUTE ON FUNCTION public.admin_job_lock_acquire(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_job_lock_release(text, uuid)    TO service_role;

-- ------------------------------------------------------------------
-- 6) RPC: CLAIM (thuê job, skip locked, hồi phục lease hết hạn)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_comment_jobs_claim(
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  id uuid, batch_id uuid, post_id uuid, user_id uuid,
  content text, attempts integer, lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT j.id
      FROM public.admin_comment_jobs j
     WHERE j.comment_id IS NULL
       AND j.attempts < j.max_attempts
       AND (
             (j.status IN ('pending', 'error') AND j.run_at <= now())
          OR (j.status = 'running' AND (j.lease_until IS NULL OR j.lease_until < now()))
       )
     ORDER BY j.run_at ASC
     LIMIT GREATEST(COALESCE(p_limit, 20), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.admin_comment_jobs j
     SET status = 'running',
         attempts = j.attempts + 1,
         lease_token = v_token,
         lease_until = now() + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 120), 10)),
         updated_at = now()
    FROM due
   WHERE j.id = due.id
  RETURNING j.id, j.batch_id, j.post_id, j.user_id, j.content, j.attempts, j.lease_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_comment_jobs_claim(integer, integer) TO service_role;

-- ------------------------------------------------------------------
-- 7) RPC: EXECUTE (chèn comment + đánh dấu done) — IDEMPOTENT
--    Nếu job đã có comment_id thì trả lại đúng comment cũ, KHÔNG chèn lại.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_comment_job_execute(
  p_id uuid,
  p_token uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.admin_comment_jobs%ROWTYPE;
  v_comment_id uuid;
BEGIN
  SELECT * INTO v_job
    FROM public.admin_comment_jobs
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_not_found';
  END IF;

  -- Đã gửi rồi: idempotent, trả lại kết quả cũ.
  IF v_job.comment_id IS NOT NULL THEN
    RETURN v_job.comment_id;
  END IF;

  IF v_job.status = 'canceled' THEN
    RETURN NULL;
  END IF;

  -- Sai lease token (worker khác đã thuê lại) -> không gửi.
  IF v_job.lease_token IS DISTINCT FROM p_token THEN
    RAISE EXCEPTION 'lease_lost';
  END IF;

  INSERT INTO public.comments (post_id, user_id, content)
  VALUES (v_job.post_id, v_job.user_id, v_job.content)
  RETURNING id INTO v_comment_id;

  UPDATE public.admin_comment_jobs
     SET status = 'done',
         comment_id = v_comment_id,
         last_error = NULL,
         lease_token = NULL,
         lease_until = NULL,
         updated_at = now()
   WHERE id = p_id;

  RETURN v_comment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_comment_job_execute(uuid, uuid) TO service_role;

-- ------------------------------------------------------------------
-- 8) RPC: COMPLETE (báo lỗi / kết thúc) — IDEMPOTENT
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_comment_jobs_complete(
  p_id uuid,
  p_token uuid,
  p_error text DEFAULT NULL,
  p_retry_after_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.admin_comment_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.admin_comment_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Đã gửi thành công -> không đổi trạng thái (idempotent).
  IF v_job.comment_id IS NOT NULL THEN
    RETURN true;
  END IF;

  IF v_job.lease_token IS DISTINCT FROM p_token THEN
    RETURN false;
  END IF;

  IF p_error IS NULL THEN
    UPDATE public.admin_comment_jobs
       SET status = 'done', lease_token = NULL, lease_until = NULL, updated_at = now()
     WHERE id = p_id;
  ELSE
    UPDATE public.admin_comment_jobs
       SET status = CASE WHEN v_job.attempts >= v_job.max_attempts THEN 'error' ELSE 'pending' END,
           last_error = left(p_error, 500),
           run_at = now() + make_interval(secs => GREATEST(COALESCE(p_retry_after_seconds, 60), 5)),
           lease_token = NULL,
           lease_until = NULL,
           updated_at = now()
     WHERE id = p_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_comment_jobs_complete(uuid, uuid, text, integer) TO service_role;

-- ------------------------------------------------------------------
-- 9) RPC: TIẾN TRÌNH THEO BATCH (UI đọc từ DB)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_comment_jobs_progress(p_batch_id uuid)
RETURNS TABLE (
  total integer, pending integer, running integer,
  done integer, failed integer, canceled integer, next_run_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE status = 'pending')::int,
    count(*) FILTER (WHERE status = 'running')::int,
    count(*) FILTER (WHERE status = 'done')::int,
    count(*) FILTER (WHERE status = 'error')::int,
    count(*) FILTER (WHERE status = 'canceled')::int,
    min(run_at) FILTER (WHERE status IN ('pending', 'running'))
  FROM public.admin_comment_jobs
  WHERE batch_id = p_batch_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_comment_jobs_progress(uuid)
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- 10) RPC: HUỶ BATCH (chỉ huỷ job chưa gửi)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_comment_jobs_cancel(p_batch_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.admin_comment_jobs
       SET status = 'canceled', lease_token = NULL, lease_until = NULL, updated_at = now()
     WHERE batch_id = p_batch_id
       AND comment_id IS NULL
       AND status IN ('pending', 'error', 'running')
     RETURNING 1
  )
  SELECT count(*)::int FROM upd;
$$;

GRANT EXECUTE ON FUNCTION public.admin_comment_jobs_cancel(uuid)
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- 11) RPC: RETRY BATCH (chỉ job lỗi, chưa có comment_id) — không gửi trùng
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_comment_jobs_retry(p_batch_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.admin_comment_jobs
       SET status = 'pending',
           attempts = 0,
           run_at = now(),
           last_error = NULL,
           lease_token = NULL,
           lease_until = NULL,
           updated_at = now()
     WHERE batch_id = p_batch_id
       AND comment_id IS NULL
       AND status IN ('error', 'canceled')
     RETURNING 1
  )
  SELECT count(*)::int FROM upd;
$$;

GRANT EXECUTE ON FUNCTION public.admin_comment_jobs_retry(uuid)
  TO anon, authenticated, service_role;
