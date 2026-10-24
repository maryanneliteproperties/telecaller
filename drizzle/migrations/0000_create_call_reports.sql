CREATE TABLE public.call_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript TEXT NOT NULL,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.call_reports TO service_role;
ALTER TABLE public.call_reports ENABLE ROW LEVEL SECURITY;