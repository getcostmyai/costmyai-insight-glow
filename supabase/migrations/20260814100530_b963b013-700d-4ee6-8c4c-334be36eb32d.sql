alter table organizations disable trigger organizations_protect_plan;
update organizations set plan = 'govern' where id = '00000000-0000-0000-0000-000000000001';
alter table organizations enable trigger organizations_protect_plan;