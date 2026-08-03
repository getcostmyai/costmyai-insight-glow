delete from public.usage_rollups where org_id in (select id from public.organizations where name like 'd35-peer-%');
delete from public.org_profiles where org_id in (select id from public.organizations where name like 'd35-peer-%');
delete from public.organizations where name like 'd35-peer-%';
delete from public.usage_rollups where org_id = 'ee5054ac-319c-4f40-be24-af19e138d01a';