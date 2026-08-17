insert into public.partners (name, referral_code, status, contact_email)
values ('Test Partner — Zero Activity', 'TESTZERO', 'active', 'zero@costmyai-test.com')
on conflict (referral_code) do nothing;

insert into public.partner_users (partner_id, user_id, role, created_at)
select p.id, 'e6c4375f-a05e-4b84-906d-96308ff6d197'::uuid, 'owner', now() - interval '10 years'
from public.partners p where p.referral_code = 'TESTZERO'
on conflict do nothing;