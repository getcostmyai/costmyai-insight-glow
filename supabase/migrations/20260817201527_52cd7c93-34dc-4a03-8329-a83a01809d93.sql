select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.organizations set plan = 'govern' where id = '00000000-0000-0000-0000-000000000001';