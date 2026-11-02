-- Run this once in Supabase SQL Editor for an existing workspace database.
ALTER TABLE public.telecaller_data ADD COLUMN IF NOT EXISTS follow_up_date date;
ALTER TABLE public.telecaller_data ADD COLUMN IF NOT EXISTS lead_stage text CHECK (lead_stage IN ('Interest', 'Not Interest'));
