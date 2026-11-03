-- Separate scheduling and post-site-visit conversion follow-ups.
-- Run once in Supabase SQL Editor.
ALTER TABLE public.telecaller_data
  ADD COLUMN IF NOT EXISTS follow_up_status text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS conversion_follow_up_date date,
  ADD COLUMN IF NOT EXISTS conversion_follow_up_status text NOT NULL DEFAULT 'Pending';

ALTER TABLE public.telecaller_data
  DROP CONSTRAINT IF EXISTS telecaller_data_follow_up_status_check;
ALTER TABLE public.telecaller_data
  ADD CONSTRAINT telecaller_data_follow_up_status_check
  CHECK (follow_up_status IN ('Pending', 'Completed', 'Rescheduled', 'Not Interested'));

ALTER TABLE public.telecaller_data
  DROP CONSTRAINT IF EXISTS telecaller_data_conversion_follow_up_status_check;
ALTER TABLE public.telecaller_data
  ADD CONSTRAINT telecaller_data_conversion_follow_up_status_check
  CHECK (conversion_follow_up_status IN ('Pending', 'Completed', 'Rescheduled', 'Not Interested'));

CREATE INDEX IF NOT EXISTS telecaller_data_conversion_follow_up_date_idx
  ON public.telecaller_data(conversion_follow_up_date);
