-- A full refund that follows a partial one must not retire the original line:
-- the partial's offsetting line still exists, and dropping the positive line
-- as well would reverse more than was ever earned. The retire shortcut is
-- therefore only for lines with no offsets written against them yet.
CREATE OR REPLACE FUNCTION public.clawback_commission(
  _invoice_id text,
  _reason text,
  _environment text DEFAULT 'live',
  _fraction numeric DEFAULT 1
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
  _target := least(greatest(coalesce(_fraction, 1), 0), 1);

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

  _delta := _target - _already;
  IF _delta <= 0.0001 THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'ledger_id', _row.id,
                              'clawed_back_fraction', _already);
  END IF;

  _rev  := round(_row.revenue_usd    * _delta, 2);
  _comm := round(_row.commission_usd * _delta, 2);

  IF _target >= 0.9999 AND _row.status <> 'paid' AND _already <= 0.0001 THEN
    -- Never transferred and nothing offset against it yet: retire the line.
    UPDATE public.commission_ledger
       SET status = 'clawed_back',
           clawed_back_fraction = 1,
           clawback_reason = left(coalesce(_reason, 'refunded'), 300),
           payout_id = NULL
     WHERE id = _row.id;
    RETURN jsonb_build_object('ok', true, 'ledger_id', _row.id, 'fraction', 1,
                              'netted_against_future_payout', false);
  END IF;

  -- Otherwise write an offsetting negative line for the newly refunded share.
  -- A distinct id per cumulative level keeps the (partner, invoice)
  -- uniqueness doing its job across successive partial refunds.
  _offset_invoice := CASE
    WHEN _target >= 0.9999 THEN _invoice_id || ':clawback'
    ELSE _invoice_id || ':clawback:' || round(_target * 10000)::int::text
  END;

  INSERT INTO public.commission_ledger (
    partner_id, org_id, invoice_id, stripe_subscription_id,
    period_start, period_end, revenue_usd, rate_pct, commission_usd,
    status, environment, clawback_of, clawback_reason
  ) VALUES (
    _row.partner_id, _row.org_id, _offset_invoice, _row.stripe_subscription_id,
    _row.period_start, _row.period_end, -_rev, _row.rate_pct, -_comm,
    'pending', _environment, _row.id, left(coalesce(_reason, 'refunded'), 300)
  )
  ON CONFLICT (partner_id, invoice_id) DO NOTHING
  RETURNING id INTO _new;

  UPDATE public.commission_ledger
     SET clawed_back_fraction = _target,
         clawback_reason = left(coalesce(_reason, 'refunded'), 300)
   WHERE id = _row.id;

  RETURN jsonb_build_object('ok', true, 'ledger_id', _row.id, 'offset_id', _new,
                            'fraction', _target, 'reversed_usd', _comm,
                            'netted_against_future_payout', _new IS NOT NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clawback_commission(text, text, text, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clawback_commission(text, text, text, numeric) TO service_role;