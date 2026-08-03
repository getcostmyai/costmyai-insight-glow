-- D35 verification seed (temporary, removed after the drill)
insert into public.usage_rollups (org_id, bucket_start, granularity, model_key, host, requests, input_tokens, output_tokens, cost_usd, is_synthetic)
select 'ee5054ac-319c-4f40-be24-af19e138d01a', date_trunc('day', now() - (g || ' days')::interval), 'day', 'openai/gpt-4o-mini', 'openai', 1000, 500000, 100000, 40.00, false
from generate_series(1,10) g;

do $$
declare i int; oid uuid;
begin
  for i in 1..4 loop
    oid := gen_random_uuid();
    insert into public.organizations (id, name, slug, is_synthetic) values (oid, 'd35-peer-'||i, 'd35-peer-'||i, false);
    insert into public.org_profiles (org_id, use_case, industry, revenue_band, headcount_band, customer_facing, maturity)
      values (oid, 'customer_facing', 'SaaS / software', '1m_10m', '50_249', true, 'production');
    insert into public.usage_rollups (org_id, bucket_start, granularity, model_key, host, requests, input_tokens, output_tokens, cost_usd, is_synthetic)
    select oid, date_trunc('day', now() - (g || ' days')::interval), 'day', 'openai/gpt-4o', 'openai', 900, 400000, 90000, 30.00 + i*5, false
    from generate_series(1,10) g;
  end loop;
end $$;