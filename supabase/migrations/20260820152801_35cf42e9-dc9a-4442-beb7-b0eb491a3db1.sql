select set_config('request.jwt.claims','{"role":"service_role"}', true);
delete from public.subscriptions where stripe_subscription_id='sub_rungdrill_232';
update public.organizations set plan='compare' where id='561efc9b-fbfb-479b-a2b7-c31a530e06fe';