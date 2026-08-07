REVOKE ALL ON public.intelligence_leads FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.intelligence_leads FROM authenticated;