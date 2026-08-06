ALTER TABLE public.partner_applications
  ADD CONSTRAINT partner_applications_active_clients_bucket_check
  CHECK (active_clients_bucket IN ('0','1–10','11–50','51–100','101–300','301–1,000','1,000+'));

ALTER TABLE public.partner_applications
  ADD CONSTRAINT partner_applications_starting_soon_bucket_check
  CHECK (starting_soon_bucket IN ('0','1','2','3+'));