-- Advanced Site Visit and Follow-up workflow fields.
-- Run once in Supabase SQL Editor after deployment (or before using the new forms).

ALTER TABLE public.telecaller_data
  ADD COLUMN IF NOT EXISTS follow_up_rescheduled_date date,
  ADD COLUMN IF NOT EXISTS follow_up_not_interested_reason text,
  ADD COLUMN IF NOT EXISTS conversion_follow_up_rescheduled_date date,
  ADD COLUMN IF NOT EXISTS conversion_follow_up_not_interested_reason text,
  ADD COLUMN IF NOT EXISTS site_visit_cancel_reason text;

ALTER TABLE public.telecaller_data
  DROP CONSTRAINT IF EXISTS telecaller_data_site_visit_status_check;

ALTER TABLE public.telecaller_data
  ADD CONSTRAINT telecaller_data_site_visit_status_check
  CHECK (site_visit_status IS NULL OR site_visit_status IN
    ('Not Planned', 'Planned', 'Confirmed', 'Completed', 'Rescheduled', 'Cancelled'));

CREATE INDEX IF NOT EXISTS telecaller_data_follow_up_rescheduled_date_idx
  ON public.telecaller_data(follow_up_rescheduled_date);

CREATE INDEX IF NOT EXISTS telecaller_data_conversion_follow_up_rescheduled_date_idx
  ON public.telecaller_data(conversion_follow_up_rescheduled_date);
