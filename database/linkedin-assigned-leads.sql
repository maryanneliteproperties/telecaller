-- LinkedIn-assigned leads are kept separate from call records.
-- Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS public.linkedin_assigned_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_lead_id text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_email text NOT NULL,
  profile_name text NOT NULL,
  photo_url text,
  designation text,
  company text,
  phone text,
  contact_email text,
  linkedin_url text,
  assigned_by_name text,
  assigned_by_role text,
  assigned_at timestamptz NOT NULL,
  project text,
  follow_up_date date,
  site_visit_date date,
  linked_telecaller_data_id uuid NULL REFERENCES public.telecaller_data(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS linkedin_assigned_leads_owner_created_idx
  ON public.linkedin_assigned_leads(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_assigned_leads_email_idx
  ON public.linkedin_assigned_leads(lower(employee_email));
ALTER TABLE public.linkedin_assigned_leads ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.linkedin_assigned_leads TO authenticated;
GRANT ALL ON public.linkedin_assigned_leads TO service_role;
DROP POLICY IF EXISTS "LinkedIn assigned lead owner access" ON public.linkedin_assigned_leads;
CREATE POLICY "LinkedIn assigned lead owner access"
  ON public.linkedin_assigned_leads FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.workspace_has_admin());
