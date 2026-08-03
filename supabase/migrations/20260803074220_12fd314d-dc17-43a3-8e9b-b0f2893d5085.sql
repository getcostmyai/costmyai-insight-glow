ALTER TABLE public.partner_payouts
  ADD COLUMN IF NOT EXISTS payout_currency text NOT NULL DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS amount_payout_currency numeric,
  ADD COLUMN IF NOT EXISTS fx_detail jsonb;

COMMENT ON COLUMN public.partner_payouts.fx_rate IS
  'Weighted real exchange rate actually applied by the payment provider when the underlying charges settled. Never estimated.';
COMMENT ON COLUMN public.partner_payouts.fx_detail IS
  'Per-invoice breakdown: invoice id, balance transaction id, USD commission, rate, converted amount.';

CREATE OR REPLACE FUNCTION public.payout_record_fx(
  _payout_id uuid,
  _currency text,
  _rate numeric,
  _amount numeric,
  _detail jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _rate IS NULL OR _rate <= 0 THEN
    RAISE EXCEPTION 'a payout cannot be recorded without a real exchange rate'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.partner_payouts
     SET payout_currency = lower(_currency),
         fx_rate = _rate,
         amount_payout_currency = _amount,
         fx_detail = _detail,
         updated_at = now()
   WHERE id = _payout_id;
END;
$function$;