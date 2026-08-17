delete from public.partner_users pu using public.partners p
where pu.partner_id = p.id and p.referral_code = 'TESTZERO';
delete from public.partners where referral_code = 'TESTZERO';