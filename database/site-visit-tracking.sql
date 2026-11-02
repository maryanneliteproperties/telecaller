-- Reports page: Site Visit tracking fields
-- Run once in Supabase SQL Editor.
ALTER TABLE public.telecaller_data
  ADD COLUMN IF NOT EXISTS site_visit_date date,
  ADD COLUMN IF NOT EXISTS site_visit_status text NOT NULL DEFAULT 'Not Planned';

ALTER TABLE public.telecaller_data
  DROP CONSTRAINT IF EXISTS telecaller_data_site_visit_status_check;

ALTER TABLE public.telecaller_data
  ADD CONSTRAINT telecaller_data_site_visit_status_check
  CHECK (site_visit_status IN ('Not Planned', 'Planned', 'Confirmed', 'Completed', 'Rescheduled', 'Cancelled'));

CREATE INDEX IF NOT EXISTS telecaller_data_site_visit_date_idx
  ON public.telecaller_data(site_visit_date);
