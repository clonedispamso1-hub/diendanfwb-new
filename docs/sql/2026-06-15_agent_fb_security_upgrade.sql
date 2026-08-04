-- ============================================================
-- Agent FB Accounts: 2FA + raw data + submission freeze upgrade
-- Run this in Supabase SQL Editor against the existing project.
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE public.agent_fb_accounts
  ADD COLUMN IF NOT EXISTS twofa_key        text,
  ADD COLUMN IF NOT EXISTS gmail_recovery   text,
  ADD COLUMN IF NOT EXISTS account_password text,
  ADD COLUMN IF NOT EXISTS raw_account_data text,
  ADD COLUMN IF NOT EXISTS is_submitted     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_at     timestamptz;

ALTER TABLE public.agent_activity_logs
  ADD COLUMN IF NOT EXISTS daily_new_accounts_target int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS daily_groups_target       int NOT NULL DEFAULT 10;

-- Index to speed up freeze checks
CREATE INDEX IF NOT EXISTS idx_agent_fb_submitted
  ON public.agent_fb_accounts (agent_id, report_date, is_submitted);
