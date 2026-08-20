select set_config('request.jwt.claims','{"role":"service_role"}', true);
update public.organizations set plan='govern' where id='561efc9b-fbfb-479b-a2b7-c31a530e06fe';
update public.subscriptions set plan='govern' where stripe_subscription_id='sub_rungdrill_232';