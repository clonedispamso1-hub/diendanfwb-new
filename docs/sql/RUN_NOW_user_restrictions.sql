-- =====================================================================
-- User Restrictions system (per-action + duration).
-- Idempotent — safe to run multiple times in Supabase SQL Editor.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_restrictions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('suspend','post','comment','like','message','find_zalo')),
  reason      text,
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                       -- NULL = permanent
  created_by  uuid,
  revoked_at  timestamptz,
  revoked_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_restrictions_lookup
  ON public.user_restrictions (user_id, kind, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_user_restrictions_user
  ON public.user_restrictions (user_id, created_at DESC);

GRANT SELECT ON public.user_restrictions TO authenticated;
GRANT ALL    ON public.user_restrictions TO service_role;

ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own restrictions"   ON public.user_restrictions;
DROP POLICY IF EXISTS "admin reads all restrictions"  ON public.user_restrictions;
DROP POLICY IF EXISTS "admin writes restrictions"     ON public.user_restrictions;
DROP POLICY IF EXISTS "admin updates restrictions"    ON public.user_restrictions;

CREATE POLICY "user reads own restrictions"
  ON public.user_restrictions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin reads all restrictions"
  ON public.user_restrictions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false)));

CREATE POLICY "admin writes restrictions"
  ON public.user_restrictions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false)));

CREATE POLICY "admin updates restrictions"
  ON public.user_restrictions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false)));

-- Fast boolean check usable from other RPCs / triggers.
CREATE OR REPLACE FUNCTION public.has_active_restriction(_user uuid, _kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_restrictions
    WHERE user_id = _user
      AND kind = _kind
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_restriction(uuid, text) TO authenticated, anon, service_role;

-- Returns active restrictions for the caller (auto-filters expired/revoked).
CREATE OR REPLACE FUNCTION public.my_active_restrictions()
RETURNS SETOF public.user_restrictions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.user_restrictions
  WHERE user_id = auth.uid()
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
$$;

GRANT EXECUTE ON FUNCTION public.my_active_restrictions() TO authenticated;