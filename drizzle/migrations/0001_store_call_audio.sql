ALTER TABLE public.call_reports ADD COLUMN audio_path TEXT, ADD COLUMN audio_name TEXT;
GRANT SELECT ON public.call_reports TO authenticated;
CREATE POLICY "Signed-in users can read call reports" ON public.call_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users can read call audio" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'call-audio');