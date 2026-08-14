alter table public.organizations disable trigger user;
update public.organizations set plan='govern' where id='00000000-0000-0000-0000-000000000001';
alter table public.organizations enable trigger user;