-- Shared server-side guards for AI call analysis.
-- Run this once in the destination Supabase project's SQL Editor before deploying this feature.

CREATE TABLE IF NOT EXISTS public.call_analysis_guards (
  guard_key text PRIMARY KEY,
  lock_token uuid,
  locked_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_analysis_guards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_analysis_guards FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.call_analysis_guards TO service_role;

-- Atomically claim one lead. A crashed request can be recovered after the 10-minute lease.
CREATE OR REPLACE FUNCTION public.claim_call_analysis(p_lead_id uuid, p_lock_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed boolean := false;
BEGIN
  INSERT INTO public.call_analysis_guards (guard_key, lock_token, locked_until, updated_at)
  VALUES ('lead:' || p_lead_id::text, p_lock_token, now() + interval '10 minutes', now())
  ON CONFLICT (guard_key) DO UPDATE
    SET lock_token = EXCLUDED.lock_token,
        locked_until = EXCLUDED.locked_until,
        updated_at = now()
    WHERE public.call_analysis_guards.locked_until <= now()
  RETURNING true INTO claimed;

  RETURN COALESCE(claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_call_analysis(p_lead_id uuid, p_lock_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.call_analysis_guards
  WHERE guard_key = 'lead:' || p_lead_id::text
    AND lock_token = p_lock_token;
$$;

-- A model quota error is shared by every employee and browser tab using this API project.
CREATE OR REPLACE FUNCTION public.get_call_analysis_quota_block()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT locked_until
  FROM public.call_analysis_guards
  WHERE guard_key = 'quota:gemini-3.8-flash'
    AND locked_until > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_call_analysis_quota_block(p_blocked_until timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.call_analysis_guards (guard_key, lock_token, locked_until, updated_at)
  VALUES ('quota:gemini-3.8-flash', NULL, p_blocked_until, now())
  ON CONFLICT (guard_key) DO UPDATE
    SET lock_token = NULL,
        locked_until = GREATEST(public.call_analysis_guards.locked_until, EXCLUDED.locked_until),
        updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.claim_call_analysis(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_call_analysis(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_call_analysis_quota_block() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_call_analysis_quota_block(timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_call_analysis(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_call_analysis(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_call_analysis_quota_block() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_call_analysis_quota_block(timestamptz) TO service_role;
