ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS autonomous_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.autonomous_enabled IS
  'Govern: explicit opt-in to autonomous switching. Being on the Govern plan is necessary but not sufficient — the workspace must also switch this on.';