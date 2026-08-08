-- The partner-facing demo workspace: a second, separate synthetic workspace so a
-- partner demo can never collide with the internal one under active audit.
insert into public.organizations (id, name, slug, plan, billing_interval, is_synthetic)
values ('00000000-0000-0000-0000-000000000002', 'Partner Demo Workspace', 'partner-demo', 'govern', 'monthly', true)
on conflict (id) do nothing;

-- Is this user a real, currently-active partner? Active is checked on the
-- partnership itself (partners.status), not merely on the membership row, so a
-- suspended or pending partner is denied the moment their status changes.
create or replace function public.is_active_partner(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
    where pu.user_id = _user_id
      and p.status = 'active'
  )
$$;

revoke all on function public.is_active_partner(uuid) from public, anon;
grant execute on function public.is_active_partner(uuid) to authenticated, service_role;