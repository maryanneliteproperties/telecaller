-- telecaller_data: one row per analysed call, one column per detailed
-- caller-report sub-heading. Idempotent — safe to run again.
-- NOTE: the introduction score column is named introduction_score_1 (matches the live table).
CREATE TABLE IF NOT EXISTS public.telecaller_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_report_id uuid,
  customer_name text,
  customer_phone text,
  telecaller_name text,
  audio_path text,
  audio_name text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- மொத்த மதிப்பெண்
  overall_score integer,
  improvement_area text,

  -- அறிமுகம் மற்றும் பேச்சுத்திறன் (10%)
  introduction_score_1 integer,
  introduction_strength text,
  introduction_missed text,
  introduction_evidence text,
  introduction_timestamp text,
  introduction_improvement text,
  introduction_better_wording text,

  -- வாடிக்கையாளர் தேவையை அறிதல் (20%)
  discovery_score integer,
  discovery_strength text,
  discovery_missed text,
  discovery_evidence text,
  discovery_timestamp text,
  discovery_improvement text,
  discovery_better_wording text,

  -- கவனமாகக் கேட்டல் (15%)
  listening_score integer,
  listening_strength text,
  listening_missed text,
  listening_evidence text,
  listening_timestamp text,
  listening_improvement text,
  listening_better_wording text,

  -- திட்டத்தை விளக்கும் திறன் (20%)
  explanation_score integer,
  explanation_strength text,
  explanation_missed text,
  explanation_evidence text,
  explanation_timestamp text,
  explanation_improvement text,
  explanation_better_wording text,

  -- எதிர்ப்புகளைக் கையாளுதல் (15%)
  objections_score integer,
  objections_strength text,
  objections_missed text,
  objections_evidence text,
  objections_timestamp text,
  objections_improvement text,
  objections_better_wording text,

  -- Closing மற்றும் அடுத்த நடவடிக்கை (20%)
  closing_score integer,
  closing_strength text,
  closing_missed text,
  closing_evidence text,
  closing_timestamp text,
  closing_improvement text,
  closing_better_wording text,

  -- உரையாடல் சரிபார்ப்புப் பட்டியல் & பயிற்சி பரிந்துரைகள்
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  coaching_1 text,
  coaching_2 text,
  coaching_3 text
);

GRANT SELECT ON public.telecaller_data TO authenticated;
GRANT ALL ON public.telecaller_data TO service_role;
ALTER TABLE public.telecaller_data ENABLE ROW LEVEL SECURITY;

-- Simple signed-in read policy; workspace-access.sql replaces it with
-- owner/admin scoping once profiles and roles exist.
DROP POLICY IF EXISTS "Signed-in users can read telecaller data" ON public.telecaller_data;
CREATE POLICY "Signed-in users can read telecaller data"
  ON public.telecaller_data FOR SELECT TO authenticated USING (true);
