-- Lock down helper functions to signed-in callers only
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_manager(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.org_plan(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_plan(uuid) TO authenticated;

-- ============ MODEL CATALOG ============
INSERT INTO public.model_catalog (model_key, display_name, vendor, tier, context_window, is_reasoning) VALUES
('gpt-5.5','GPT-5.5','openai','frontier',400000,true),
('gpt-5.4','GPT-5.4','openai','frontier',400000,true),
('gpt-5-6-sol','GPT-5.6 Sol','openai','frontier',400000,true),
('gpt-5-6-terra','GPT-5.6 Terra','openai','standard',400000,false),
('gpt-5-6-luna','GPT-5.6 Luna','openai','economy',400000,false),
('o1','o1','openai','frontier',200000,true),
('o1-pro','o1-pro','openai','frontier',200000,true),
('gpt-4','GPT-4','openai','frontier',128000,false),
('claude-opus-4-7','Claude Opus 4.7','anthropic','frontier',200000,true),
('claude-opus-4-7-fast','Claude Opus 4.7 Fast','anthropic','frontier',200000,false),
('claude-opus-4-5','Claude Opus 4.5','anthropic','frontier',200000,true),
('qwen3-coder-next','Qwen3 Coder Next','alibaba','standard',128000,false),
('qwen3-32b','Qwen3 32B','alibaba','economy',32000,false),
('gpt-oss-120b','GPT-OSS 120B','openai','standard',128000,false),
('deepseek-v4-flash','DeepSeek V4 Flash','deepseek','economy',128000,false),
('llama-3.3-70b-instruct','Llama 3.3 70B Instruct','meta','standard',128000,false);

-- ============ HOST PRICES (USD per 1M tokens) ============
INSERT INTO public.host_prices (model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok) VALUES
('gpt-5.5','api.openai.com','OpenAI',2.5000,10.0000),
('gpt-5.5','azure','Azure AI Foundry',1.7250,6.9000),
('gpt-5.4','api.openai.com','OpenAI',2.0000,8.0000),
('gpt-5.4','azure','Azure AI Foundry',1.4400,5.7600),
('gpt-5-6-sol','openai','OpenAI',3.0000,12.0000),
('gpt-5-6-terra','openai','OpenAI',1.0000,4.0000),
('gpt-5-6-luna','openai','OpenAI',0.2000,0.8000),
('o1','api.openai.com','OpenAI',15.0000,60.0000),
('o1-pro','api.openai.com','OpenAI',150.0000,600.0000),
('gpt-4','api.openai.com','OpenAI',30.0000,60.0000),
('claude-opus-4-7','api.anthropic.com','Anthropic',15.0000,75.0000),
('claude-opus-4-7-fast','api.anthropic.com','Anthropic',8.0000,40.0000),
('claude-opus-4-5','api.anthropic.com','Anthropic',15.0000,75.0000),
('qwen3-coder-next','dashscope.aliyuncs.com','Alibaba DashScope',0.9000,3.6000),
('qwen3-coder-next','ionstream','IonStream',0.5040,2.0160),
('qwen3-32b','api.groq.com','Groq',0.2900,0.5900),
('qwen3-32b','alibaba','Alibaba Cloud',0.2400,0.4900),
('gpt-oss-120b','api.deepinfra.com','DeepInfra',0.1500,0.6000),
('gpt-oss-120b','wandb','Weights & Biases',0.1170,0.4680),
('deepseek-v4-flash','api.venice.ai','Venice AI',0.2800,1.1200),
('deepseek-v4-flash','alibaba','Alibaba Cloud',0.2270,0.9070),
('llama-3.3-70b-instruct','api.together.xyz','Together AI',0.8800,0.8800),
('llama-3.3-70b-instruct','api.deepinfra.com','DeepInfra',0.2300,0.4000);

-- ============ BENCHMARKS (0-100 quality score by task class) ============
INSERT INTO public.benchmarks (model_key, suite, task_class, score, source) VALUES
('claude-opus-4-7','costmyai-v1','generation',94.200,'internal'),
('claude-opus-4-7-fast','costmyai-v1','generation',91.100,'internal'),
('claude-opus-4-5','costmyai-v1','generation',92.400,'internal'),
('gpt-5-6-sol','costmyai-v1','generation',94.800,'internal'),
('gpt-5-6-terra','costmyai-v1','generation',91.900,'internal'),
('gpt-5-6-luna','costmyai-v1','generation',84.300,'internal'),
('gpt-5.5','costmyai-v1','generation',93.500,'internal'),
('gpt-5.4','costmyai-v1','generation',91.700,'internal'),
('o1','costmyai-v1','generation',89.600,'internal'),
('o1-pro','costmyai-v1','generation',93.100,'internal'),
('gpt-4','costmyai-v1','generation',82.400,'internal'),
('gpt-oss-120b','costmyai-v1','generation',88.900,'internal'),
('qwen3-coder-next','costmyai-v1','generation',87.200,'internal'),
('qwen3-32b','costmyai-v1','generation',79.500,'internal'),
('deepseek-v4-flash','costmyai-v1','generation',83.800,'internal'),
('llama-3.3-70b-instruct','costmyai-v1','generation',85.100,'internal'),
('claude-opus-4-7','costmyai-v1','code',93.800,'internal'),
('gpt-5-6-sol','costmyai-v1','code',95.100,'internal'),
('gpt-5-6-terra','costmyai-v1','code',92.200,'internal'),
('qwen3-coder-next','costmyai-v1','code',90.400,'internal'),
('gpt-oss-120b','costmyai-v1','code',87.600,'internal'),
('gpt-5.5','costmyai-v1','code',94.000,'internal'),
('gpt-5.4','costmyai-v1','code',92.300,'internal'),
('claude-opus-4-7','costmyai-v1','classification',90.100,'internal'),
('gpt-5-6-luna','costmyai-v1','classification',88.700,'internal'),
('qwen3-32b','costmyai-v1','classification',87.900,'internal'),
('deepseek-v4-flash','costmyai-v1','classification',88.200,'internal'),
('gpt-4','costmyai-v1','classification',86.500,'internal');

-- ============ DEMO ORGANISATION ============
INSERT INTO public.organizations (id, name, slug, plan) VALUES
('00000000-0000-0000-0000-000000000001','Demo Workspace','demo','rightsize');

-- 30 days of daily usage across the observed stack
INSERT INTO public.usage_rollups (org_id, bucket_start, granularity, model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  d,
  'day',
  m.model_key,
  m.host,
  m.task_hint,
  (m.base_requests * (0.85 + random() * 0.3))::int,
  (m.base_in * (0.85 + random() * 0.3))::bigint,
  (m.base_out * (0.85 + random() * 0.3))::bigint,
  0
FROM generate_series(now()::date - interval '29 days', now()::date, interval '1 day') AS d
CROSS JOIN (VALUES
  ('gpt-5.5','api.openai.com','generation', 420, 6200000, 1500000),
  ('gpt-5.4','api.openai.com','generation', 380, 5400000, 1300000),
  ('qwen3-coder-next','dashscope.aliyuncs.com','code', 610, 4100000, 1100000),
  ('gpt-oss-120b','api.deepinfra.com','generation', 900, 7800000, 2200000),
  ('deepseek-v4-flash','api.venice.ai','classification', 1400, 5900000, 620000),
  ('qwen3-32b','api.groq.com','classification', 1750, 6400000, 540000),
  ('claude-opus-4-7-fast','api.anthropic.com','generation', 130, 900000, 260000),
  ('claude-opus-4-5','api.anthropic.com','generation', 95, 640000, 190000),
  ('claude-opus-4-7','api.anthropic.com','generation', 70, 480000, 150000),
  ('o1-pro','api.openai.com','generation', 22, 95000, 32000),
  ('gpt-4','api.openai.com','generation', 210, 640000, 180000)
) AS m(model_key, host, task_hint, base_requests, base_in, base_out);

-- Cost each rollup from the price book
UPDATE public.usage_rollups r
SET cost_usd = ROUND((r.input_tokens / 1000000.0) * p.input_usd_per_mtok + (r.output_tokens / 1000000.0) * p.output_usd_per_mtok, 6)
FROM public.host_prices p
WHERE p.model_key = r.model_key AND p.host = r.host
  AND r.org_id = '00000000-0000-0000-0000-000000000001';