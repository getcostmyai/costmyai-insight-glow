select set_config('request.jwt.claims','{"role":"service_role"}', true);
update public.organizations set plan='certify' where id='561efc9b-fbfb-479b-a2b7-c31a530e06fe';
insert into public.subscriptions (org_id, stripe_subscription_id, stripe_customer_id, price_id, plan, status, environment, current_period_end)
values ('561efc9b-fbfb-479b-a2b7-c31a530e06fe','sub_rungdrill_232','cus_rungdrill_232','price_rungdrill_certify','certify','active','sandbox', now() + interval '30 days');