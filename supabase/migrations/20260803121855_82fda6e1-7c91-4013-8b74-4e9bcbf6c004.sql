CREATE OR REPLACE FUNCTION public.payout_begin(
  _partner_id uuid,
  _environment text,
  _actor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p record;
  _payout uuid;
  _total numeric;
  _count integer;
  -- Monthly payout floor. A balance under this rides forward untouched.
  _minimum constant numeric := 50;
BEGIN
  SELECT id, name, status, stripe_connect_account_id, stripe_connect_status
    INTO _p FROM public.partners WHERE id = _partner_id FOR UPDATE;
  IF _p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_partner');
  END IF;
  IF _p.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_active', 'partner_name', _p.name);
  END IF;
  IF _p.stripe_connect_account_id IS NULL OR _p.stripe_connect_status <> 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'payout_account_not_ready',
      'connect_status', _p.stripe_connect_status,
      'partner_name', _p.name
    );
  END IF;

  SELECT coalesce(sum(commission_usd), 0), count(*)
    INTO _total, _count
    FROM public.commission_ledger
   WHERE partner_id = _partner_id
     AND environment = _environment
     AND status = 'pending'
     AND payout_id IS NULL;

  IF _count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nothing_owed', 'partner_name', _p.name);
  END IF;
  IF _total <= 0 THEN
    -- Clawbacks outweigh what is owed: the negative balance stays on the
    -- ledger and nets against the next run rather than paying out zero.
    RETURN jsonb_build_object('ok', false, 'reason', 'negative_balance',
                              'amount_usd', _total, 'partner_name', _p.name);
  END IF;
  IF round(_total, 2) < _minimum THEN
    -- Under the monthly floor: skipped, not failed. No lines are reserved, the
    -- balance is untouched and carries into the next run indefinitely.
    RETURN jsonb_build_object('ok', false, 'reason', 'below_minimum',
                              'amount_usd', round(_total, 2),
                              'minimum_usd', _minimum,
                              'line_count', _count,
                              'partner_name', _p.name);
  END IF;

  INSERT INTO public.partner_payouts (
    partner_id, environment, amount_usd, line_count, status,
    stripe_destination_account, created_by
  ) VALUES (
    _partner_id, _environment, round(_total, 2), _count, 'pending',
    _p.stripe_connect_account_id, _actor
  ) RETURNING id INTO _payout;

  UPDATE public.commission_ledger
     SET payout_id = _payout
   WHERE partner_id = _partner_id
     AND environment = _environment
     AND status = 'pending'
     AND payout_id IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'payout_id', _payout,
    'amount_usd', round(_total, 2),
    'line_count', _count,
    'destination', _p.stripe_connect_account_id,
    'partner_name', _p.name
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payout_begin(uuid, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_begin(uuid, text, uuid) TO service_role;