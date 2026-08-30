-- Symmetric un-clawback for a dispute resolved in the merchant's favor.
--
-- clawback_commission() only ever moves clawed_back_fraction UP (a target
-- below what's already clawed back is a no-op, by design — see its own
-- comment). A dispute won needs the opposite direction: bring the fraction
-- back DOWN to whatever the charge's own real refund state still justifies,
-- without touching a separate, genuine partial refund that happened
-- independently of the dispute. This mirrors clawback_commission's shape
-- exactly — same offsetting-ledger-line mechanism, same idempotency via a
-- distinct id per cumulative level under the (partner_id, invoice_id)
-- uniqueness constraint — just reducing instead of increasing.
--
-- Restoring a line that was fully retired (never transferred, clawed back to
-- 100%, status flipped to 'clawed_back') is put back to 'pending' rather than
-- silently re-approved: a line that was disputed once goes back through the
-- normal approval step before it can be paid out again.

CREATE OR REPLACE FUNCTION public.restore_commission(
  _invoice_id text,
  _reason text,
  _environment text DEFAULT 'live',
  _fraction numeric DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row record;
  _new uuid;
  _target numeric;
  _already numeric;
  _delta numeric;
  _rev numeric;
  _comm numeric;
  _offset_invoice text;
BEGIN
  _target := least(greatest(coalesce(_fraction, 0), 0), 1);

  SELECT * INTO _row FROM public.commission_ledger
   WHERE invoice_id = _invoice_id AND environment = _environment
     AND clawback_of IS NULL
   FOR UPDATE;
  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_ledger_row');
  END IF;

  _already := coalesce(_row.clawed_back_fraction, 0);
  IF _row.status = 'clawed_back' THEN
    _already := 1;
  END IF;

  -- Never claw back further and never move the needle if the ledger is
  -- already at or below the requested target.
  _delta := _already - _target;
  IF _delta <= 0.0001 THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'ledger_id', _row.id,
                              'clawed_back_fraction', _already);
  END IF;

  _rev  := round(_row.revenue_usd    * _delta, 2);
  _comm := round(_row.commission_usd * _delta, 2);

  -- A distinct id per cumulative level, same convention clawback_commission
  -- uses in the other direction, so the (partner_id, invoice_id) uniqueness
  -- keeps working across successive restores.
  _offset_invoice := CASE
    WHEN _target <= 0.0001 THEN _invoice_id || ':restore'
    ELSE _invoice_id || ':restore:' || round((1 - _target) * 10000)::int::text
  END;

  INSERT INTO public.commission_ledger (
    partner_id, org_id, invoice_id, stripe_subscription_id,
    period_start, period_end, revenue_usd, rate_pct, commission_usd,
    status, environment, clawback_of, clawback_reason
  ) VALUES (
    _row.partner_id, _row.org_id, _offset_invoice, _row.stripe_subscription_id,
    _row.period_start, _row.period_end, _rev, _row.rate_pct, _comm,
    'pending', _environment, _row.id, left(coalesce(_reason, 'dispute resolved in merchant favor'), 300)
  )
  ON CONFLICT (partner_id, invoice_id) DO NOTHING
  RETURNING id INTO _new;

  UPDATE public.commission_ledger
     SET clawed_back_fraction = _target,
         clawback_reason = left(coalesce(_reason, 'dispute resolved in merchant favor'), 300),
         status = CASE WHEN status = 'clawed_back' AND _target < 0.9999
                       THEN 'pending'::public.commission_status
                       ELSE status END
   WHERE id = _row.id;

  RETURN jsonb_build_object('ok', true, 'ledger_id', _row.id, 'offset_id', _new,
                            'fraction', _target, 'restored_usd', _comm,
                            'netted_against_future_payout', _new IS NOT NULL);
END;
$$;