CREATE UNIQUE INDEX partners_referral_code_lower_key ON public.partners (lower(referral_code));

CREATE UNIQUE INDEX switches_one_active_per_workload
  ON public.switches (org_id, from_model, from_host)
  WHERE status = 'active';