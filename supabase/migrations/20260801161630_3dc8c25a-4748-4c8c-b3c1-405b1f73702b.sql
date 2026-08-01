delete from public.subscriptions where stripe_subscription_id = 'sub_audit_tmp';
update public.organizations set plan = 'compare' where id = '5e7ad1de-a195-4bcb-a579-d60de6c2c0ed';