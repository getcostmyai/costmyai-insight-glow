CREATE TABLE public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  method text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, terms_version, privacy_version)
);

CREATE INDEX consent_records_user_idx ON public.consent_records (user_id, accepted_at DESC);

GRANT SELECT ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own consent records readable"
  ON public.consent_records FOR SELECT TO authenticated
  USING (auth.uid() = user_id);