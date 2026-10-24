BEGIN;
CREATE TABLE IF NOT EXISTS public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,40}$'),
 email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own profile" ON public.profiles;
CREATE POLICY "Read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE TABLE IF NOT EXISTS public.user_roles (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('admin','employee')),
 PRIMARY KEY(user_id,role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own role" ON public.user_roles;
CREATE POLICY "Read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.workspace_has_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role='admin'); $$;
REVOKE ALL ON FUNCTION public.workspace_has_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_has_admin() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.create_workspace_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.raw_user_meta_data ? 'username' THEN
  INSERT INTO public.profiles(id,username,email) VALUES(NEW.id,lower(trim(NEW.raw_user_meta_data->>'username')),NEW.email);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.create_workspace_profile() FROM PUBLIC;
DROP TRIGGER IF EXISTS create_workspace_profile ON auth.users;
CREATE TRIGGER create_workspace_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_workspace_profile();
CREATE TABLE IF NOT EXISTS public.workspace_admin_sessions (
 token_hash text PRIMARY KEY,
 expires_at timestamptz NOT NULL
);
GRANT ALL ON public.workspace_admin_sessions TO service_role;
ALTER TABLE public.workspace_admin_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.workspace_login_attempts (
 scope text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 0,
 window_start timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.workspace_login_attempts TO service_role;
ALTER TABLE public.workspace_login_attempts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.consume_workspace_attempt(attempt_scope text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_count integer;
BEGIN
 INSERT INTO public.workspace_login_attempts AS a(scope,attempts,window_start) VALUES(attempt_scope,1,now())
 ON CONFLICT(scope) DO UPDATE SET
 attempts = CASE WHEN a.window_start < now()-interval '15 minutes' THEN 1 ELSE a.attempts+1 END,
 window_start = CASE WHEN a.window_start < now()-interval '15 minutes' THEN now() ELSE a.window_start END
 RETURNING attempts INTO current_count;
 RETURN current_count <= 5;
END; $$;
REVOKE ALL ON FUNCTION public.consume_workspace_attempt(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_workspace_attempt(text) TO service_role;
ALTER TABLE public.telecaller_data ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.telecaller_data ADD COLUMN IF NOT EXISTS submission_key uuid;
ALTER TABLE public.telecaller_data ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'submitted';
CREATE UNIQUE INDEX IF NOT EXISTS telecaller_submission_key ON public.telecaller_data(submission_key);
ALTER TABLE public.call_reports ADD COLUMN IF NOT EXISTS owner_id uuid;
GRANT SELECT ON public.telecaller_data,public.call_reports TO authenticated;
GRANT ALL ON public.telecaller_data,public.call_reports TO service_role;
ALTER TABLE public.telecaller_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users can read telecaller data" ON public.telecaller_data;
DROP POLICY IF EXISTS "Workspace lead access" ON public.telecaller_data;
CREATE POLICY "Workspace lead access" ON public.telecaller_data FOR SELECT TO authenticated USING(owner_id=auth.uid() OR public.workspace_has_admin());
DROP POLICY IF EXISTS "Signed-in users can read call reports" ON public.call_reports;
DROP POLICY IF EXISTS "Workspace report access" ON public.call_reports;
CREATE POLICY "Workspace report access" ON public.call_reports FOR SELECT TO authenticated USING(owner_id=auth.uid() OR public.workspace_has_admin());
DROP POLICY IF EXISTS "Signed-in users can read call audio" ON storage.objects;
DROP POLICY IF EXISTS "Workspace audio access" ON storage.objects;
CREATE POLICY "Workspace audio access" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='call-audio' AND (public.workspace_has_admin() OR EXISTS (SELECT 1 FROM public.telecaller_data t WHERE t.audio_path=name AND t.owner_id=auth.uid())));
COMMIT;
