-- Fix: payout_settle and payout_fail did not lock or check the current
-- status of the partner_payouts row before transitioning it. This allowed
-- a stale/delayed settle (e.g. a late Stripe webhook) to mark an
-- already-failed payout 'paid' after its ledger lines had already been
-- unlinked and re-paid via a later payout_begin run -- a double-pay /
-- unreconcilable-stuck-payout shape. Both functions now lock the payout
-- row FOR UPDATE (matching payout_begin's existing lock pattern on
-- partners) and refuse to transition unless the current status is
-- 'pending' -- the only status payout_begin ever creates a row with, and
-- the only sensible pre-state for either a settle or a fail. Once a
-- payout has left 'pending' (to 'paid' or 'failed'), any second attempt
-- to settle or fail it is rejected, not silently ignored -- matching the
-- terminal-state guard convention already used in set_switch_state.

CREATE OR REPLACE FUNCTION public.payout_settle(
  _payout_id uuid,
  _transfer_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _po record;
BEGIN
  SELECT id, status INTO _po
    FROM public.partner_payouts
   WHERE id = _payout_id
   FOR UPDATE;

  IF _po.id IS NULL THEN
    RAISE EXCEPTION 'payout % not found', _payout_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF _po.status <> 'pending' THEN
    RAISE EXCEPTION 'payout % cannot be settled from status %, only from pending',
      _payout_id, _po.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.partner_payouts
     SET status = 'paid', stripe_transfer_id = _transfer_id, error = NULL
   WHERE id = _payout_id;

  UPDATE public.commission_ledger
     SET status = 'paid', paid_at = now(), stripe_transfer_id = _transfer_id
   WHERE payout_id = _payout_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payout_settle(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_settle(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.payout_fail(
  _payout_id uuid,
  _error text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _po record;
BEGIN
  SELECT id, status INTO _po
    FROM public.partner_payouts
   WHERE id = _payout_id
   FOR UPDATE;

  IF _po.id IS NULL THEN
    RAISE EXCEPTION 'payout % not found', _payout_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF _po.status <> 'pending' THEN
    RAISE EXCEPTION 'payout % cannot be failed from status %, only from pending',
      _payout_id, _po.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The lines go back to unpaid so the next run picks them up again.
  UPDATE public.commission_ledger SET payout_id = NULL WHERE payout_id = _payout_id;
  UPDATE public.partner_payouts
     SET status = 'failed', error = left(coalesce(_error, 'unknown error'), 500)
   WHERE id = _payout_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payout_fail(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_fail(uuid, text) TO service_role;