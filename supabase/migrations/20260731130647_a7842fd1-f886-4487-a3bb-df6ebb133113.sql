GRANT SELECT ON public.billing_captures TO anon;
GRANT SELECT ON public.billing_reconciliations TO anon;

CREATE POLICY "public read demo billing captures"
  ON public.billing_captures FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_synthetic);

CREATE POLICY "public read demo billing reconciliations"
  ON public.billing_reconciliations FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_captures c
      WHERE c.id = billing_reconciliations.capture_id
        AND c.org_id = billing_reconciliations.org_id
        AND c.org_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND c.is_synthetic
    )
  );