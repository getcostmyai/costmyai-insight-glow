-- Rollup-failure drill (temporary): remove the rolled-up figures for one real
-- workspace so the new coverage check can be observed catching a genuine gap.
delete from public.usage_rollups where org_id = '5e7ad1de-a195-4bcb-a579-d60de6c2c0ed';