-- Durable, server-owned audio processing queue.
-- Run this in the EXTERNAL DESTINATION Supabase SQL Editor, not the managed source project.
CREATE TABLE IF NOT EXISTS public.audio_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.telecaller_data(id) ON DELETE CASCADE,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  stage text NOT NULL DEFAULT 'transcribing' CHECK (stage IN ('transcribing','analysing','completed')),
  transcript text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS audio_processing_jobs_ready_idx
  ON public.audio_processing_jobs(status, next_attempt_at, created_at);
ALTER TABLE public.audio_processing_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audio_processing_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.audio_processing_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.claim_audio_processing_job()
RETURNS SETOF public.audio_processing_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stale AS (
    UPDATE public.audio_processing_jobs
    SET status = 'failed', last_error = COALESCE(last_error, 'Worker lease expired too many times.'),
        locked_at = NULL, updated_at = now()
    WHERE status = 'processing' AND attempts >= 10
      AND locked_at < now() - interval '10 minutes'
    RETURNING lead_id
  ),
  mark_stale_leads AS (
    UPDATE public.telecaller_data AS lead
    SET processing_status = 'failed'
    FROM stale
    WHERE lead.id = stale.lead_id
    RETURNING lead.id
  ),
  candidate AS (
    SELECT id
    FROM public.audio_processing_jobs
    WHERE attempts < 10
      AND (
        (status = 'queued' AND next_attempt_at <= now())
        OR (status = 'processing' AND locked_at < now() - interval '10 minutes')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.audio_processing_jobs AS active
        WHERE active.status = 'processing'
          AND active.locked_at >= now() - interval '10 minutes'
      )
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.audio_processing_jobs AS job
  SET status = 'processing',
      attempts = job.attempts + 1,
      locked_at = now(),
      updated_at = now()
  FROM candidate
  WHERE job.id = candidate.id
  RETURNING job.*;
$$;
REVOKE ALL ON FUNCTION public.claim_audio_processing_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_audio_processing_job() TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_audio_processing_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.audio_path IS NOT NULL
     AND NEW.call_report_id IS NULL
     AND COALESCE(NEW.processing_status, 'submitted') NOT IN ('analysed','completed') THEN
    INSERT INTO public.audio_processing_jobs(lead_id, filename, status, stage)
    VALUES (NEW.id, COALESCE(NEW.audio_name, 'call'), 'queued', 'transcribing')
    ON CONFLICT (lead_id) DO UPDATE
      SET filename = EXCLUDED.filename,
          status = CASE WHEN public.audio_processing_jobs.status = 'completed'
                        THEN 'completed' ELSE 'queued' END,
          next_attempt_at = CASE WHEN public.audio_processing_jobs.status = 'completed'
                                 THEN public.audio_processing_jobs.next_attempt_at ELSE now() END,
          locked_at = NULL,
          updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS telecaller_data_enqueue_audio ON public.telecaller_data;
CREATE TRIGGER telecaller_data_enqueue_audio
AFTER INSERT OR UPDATE OF audio_path
ON public.telecaller_data
FOR EACH ROW EXECUTE FUNCTION public.enqueue_audio_processing_job();

-- Backfill all existing unreported audio leads, including records left pending
-- by browser closure, refreshes, route changes, or previous interrupted runs.
INSERT INTO public.audio_processing_jobs(lead_id, filename, status, stage)
SELECT t.id, COALESCE(t.audio_name, 'call'), 'queued', 'transcribing'
FROM public.telecaller_data AS t
WHERE t.audio_path IS NOT NULL
  AND t.call_report_id IS NULL
  AND COALESCE(t.processing_status, 'submitted') NOT IN ('analysed','completed')
ON CONFLICT (lead_id) DO UPDATE
SET filename = EXCLUDED.filename,
    status = CASE WHEN public.audio_processing_jobs.status = 'completed'
                  THEN 'completed' ELSE 'queued' END,
    next_attempt_at = CASE WHEN public.audio_processing_jobs.status = 'completed'
                           THEN public.audio_processing_jobs.next_attempt_at ELSE now() END,
    locked_at = NULL,
    updated_at = now();

-- Existing reports are already complete; do not regenerate them.
UPDATE public.audio_processing_jobs AS job
SET status = 'completed', stage = 'completed', completed_at = COALESCE(job.completed_at, now()),
    locked_at = NULL, updated_at = now()
FROM public.telecaller_data AS lead
WHERE lead.id = job.lead_id AND lead.call_report_id IS NOT NULL;
