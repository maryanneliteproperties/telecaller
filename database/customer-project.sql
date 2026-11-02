-- Add optional project association to customer call submissions.
-- Run this migration in Supabase SQL Editor after projects.sql.
ALTER TABLE public.telecaller_data
  ADD COLUMN IF NOT EXISTS project_id uuid
  REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS telecaller_data_project_id_idx
  ON public.telecaller_data(project_id);
