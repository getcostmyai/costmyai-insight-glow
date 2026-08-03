do $$
declare oid uuid := gen_random_uuid();
begin
  insert into public.organizations (id, name, slug, is_synthetic) values (oid, 'd35-peer-4', 'd35-peer-4', false);
  insert into public.org_profiles (org_id, use_case, industry, revenue_band, headcount_band, customer_facing, maturity)
    values (oid, 'customer_facing', 'SaaS / software', '1m_10m', '50_249', true, 'production');
  insert into public.usage_rollups (org_id, bucket_start, granularity, model_key, host, requests, input_tokens, output_tokens, cost_usd, is_synthetic)
  select oid, date_trunc('day', now() - (g || ' days')::interval), 'day', 'openai/gpt-4o', 'openai', 900, 400000, 90000, 55.00, false
  from generate_series(1,10) g;
end $$;