WITH ranked AS (
  SELECT s.id,
         row_number() OVER (ORDER BY s.activated_at) AS rn,
         r.monthly_saving_usd
  FROM public.switches s
  JOIN public.organizations o ON o.id = s.org_id
  LEFT JOIN public.recommendations r ON r.id = s.recommendation_id
  WHERE o.is_synthetic AND s.is_synthetic
    AND s.activated_at::date = DATE '2026-08-03'
), staged AS (
  SELECT id,
         (ARRAY[17,15,13,11,9,7,5,3,1,0])[rn] AS days_ago,
         COALESCE(monthly_saving_usd, 0) AS monthly
  FROM ranked
)
UPDATE public.switches s
SET activated_at = now() - (staged.days_ago || ' days')::interval
                          + ((s.id::text ~ '^[0-9]') ::int || ' hours')::interval,
    saved_usd = round(staged.monthly / 30.0 * staged.days_ago * 0.9, 2),
    updated_at = now()
FROM staged
WHERE s.id = staged.id;

UPDATE public.switch_events e
SET created_at = s.activated_at
FROM public.switches s
JOIN public.organizations o ON o.id = s.org_id
WHERE e.switch_id = s.id AND o.is_synthetic AND e.created_at > s.activated_at;