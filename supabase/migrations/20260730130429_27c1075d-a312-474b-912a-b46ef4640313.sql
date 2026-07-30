GRANT SELECT ON public.model_catalog TO anon;
GRANT SELECT ON public.host_prices TO anon;
GRANT SELECT ON public.benchmarks TO anon;
GRANT SELECT ON public.usage_rollups TO anon;
GRANT SELECT ON public.recommendations TO anon;
GRANT SELECT ON public.switches TO anon;
GRANT SELECT ON public.workload_profiles TO anon;
GRANT SELECT ON public.organizations TO anon;

CREATE POLICY "public read models" ON public.model_catalog FOR SELECT TO anon USING (true);
CREATE POLICY "public read prices" ON public.host_prices FOR SELECT TO anon USING (true);
CREATE POLICY "public read benchmarks" ON public.benchmarks FOR SELECT TO anon USING (true);

CREATE POLICY "public read demo org" ON public.organizations FOR SELECT TO anon
  USING (id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "public read demo rollups" ON public.usage_rollups FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "public read demo recs" ON public.recommendations FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "public read demo switches" ON public.switches FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY "public read demo workloads" ON public.workload_profiles FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001');