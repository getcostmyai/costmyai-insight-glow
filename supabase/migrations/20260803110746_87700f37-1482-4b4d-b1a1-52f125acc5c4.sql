delete from public.usage_rollups where org_id in (select id from public.organizations where name = 'd35-peer-4');
delete from public.org_profiles where org_id in (select id from public.organizations where name = 'd35-peer-4');
delete from public.organizations where name = 'd35-peer-4';