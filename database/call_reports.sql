-- call_reports: one row per analysed call (transcript + full report JSON).
-- Idempotent — safe to run again. Base table for the external destination.
CREATE TABLE IF NOT EXISTS public.call_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript text NOT NULL,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  audio_path text,
  audio_name text
);

GRANT SELECT ON public.call_reports TO authenticated;
GRANT ALL ON public.call_reports TO service_role;
ALTER TABLE public.call_reports ENABLE ROW LEVEL SECURITY;

-- Simple signed-in read policy; workspace-access.sql replaces it with
-- owner/admin scoping once profiles and roles exist.
DROP POLICY IF EXISTS "Signed-in users can read call reports" ON public.call_reports;
CREATE POLICY "Signed-in users can read call reports"
  ON public.call_reports FOR SELECT TO authenticated USING (true);
