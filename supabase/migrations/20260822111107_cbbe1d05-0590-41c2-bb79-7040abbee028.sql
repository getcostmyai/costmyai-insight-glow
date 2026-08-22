ALTER TABLE public.partner_applications
  ADD COLUMN IF NOT EXISTS reviewer_email_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewer_email_error text,
  ADD COLUMN IF NOT EXISTS applicant_email_at timestamptz,
  ADD COLUMN IF NOT EXISTS applicant_email_error text;

COMMENT ON COLUMN public.partner_applications.reviewer_email_at IS 'When the internal new-application email was accepted for delivery. Only set on a true first submission.';
COMMENT ON COLUMN public.partner_applications.reviewer_email_error IS 'Why the internal new-application email did not send. Never blocks the submission.';
COMMENT ON COLUMN public.partner_applications.applicant_email_at IS 'When the applicant acknowledgement email was accepted for delivery. Only set on a true first submission.';
COMMENT ON COLUMN public.partner_applications.applicant_email_error IS 'Why the applicant acknowledgement email did not send. Never blocks the submission.';