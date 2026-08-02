-- ---------- partners: payout account ----------
ALTER TABLE public.partners
  ADD COLUMN stripe_connect_account_id text,
  ADD COLUMN stripe_connect_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN stripe_connect_environment text,
  ADD COLUMN stripe_connect_updated_at timestamptz;

ALTER TABLE public.partners
  ADD CONSTRAINT partners_connect_status_chk
  CHECK (stripe_connect_status IN ('not_started','pending','active','restricted'));

CREATE UNIQUE INDEX partners_connect_account_idx
  ON public.partners(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

-- Payout identity is set by CostMyAI's servers from what the provider reports,
-- never by the partner editing their own row.
CREATE OR REPLACE FUNCTION public.protect_partner_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_platform_admin() THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.tier_override IS DISTINCT FROM OLD.tier_override THEN
    RAISE EXCEPTION 'referral code, status and tier are set by CostMyAI, not by the partner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.stripe_connect_account_id IS DISTINCT FROM OLD.stripe_connect_account_id
     OR NEW.stripe_connect_status IS DISTINCT FROM OLD.stripe_connect_status
     OR NEW.stripe_connect_environment IS DISTINCT FROM OLD.stripe_connect_environment THEN
    RAISE EXCEPTION 'payout account state is set by the payment provider, not by the partner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------- payout runs ----------
CREATE TABLE public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  environment text NOT NULL,
  amount_usd numeric NOT NULL,
  line_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  stripe_transfer_id text,
  stripe_destination_account text,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_payouts_status_chk CHECK (status IN ('pending','paid','failed'))
);

CREATE UNIQUE INDEX partner_payouts_transfer_idx
  ON public.partner_payouts(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;
CREATE INDEX partner_payouts_partner_idx ON public.partner_payouts(partner_id, created_at DESC);

GRANT SELECT ON public.partner_payouts TO authenticated;
GRANT ALL ON public.partner_payouts TO service_role;

ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners read their own payouts" ON public.partner_payouts
  FOR SELECT TO authenticated
  USING (public.is_partner_member(partner_id) OR public.is_platform_admin());

CREATE TRIGGER partner_payouts_touch BEFORE UPDATE ON public.partner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- ledger: payout traceability and clawbacks ----------
ALTER TABLE public.commission_ledger
  ADD COLUMN payout_id uuid REFERENCES public.partner_payouts(id) ON DELETE SET NULL,
  ADD COLUMN stripe_transfer_id text,
  ADD COLUMN clawback_of uuid REFERENCES public.commission_ledger(id) ON DELETE SET NULL,
  ADD COLUMN clawback_reason text;

CREATE INDEX commission_ledger_payout_idx ON public.commission_ledger(payout_id);

-- ---------- payout account writes (server only) ----------
CREATE OR REPLACE FUNCTION public.partner_set_connect_account(
  _partner_id uuid,
  _account_id text,
  _status text,
  _environment text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('not_started','pending','active','restricted') THEN
    RAISE EXCEPTION 'unknown payout account status %', _status;
  END IF;
  UPDATE public.partners
     SET stripe_connect_account_id = coalesce(_account_id, stripe_connect_account_id),
         stripe_connect_status = _status,
         stripe_connect_environment = coalesce(_environment, stripe_connect_environment),
         stripe_connect_updated_at = now(),
         updated_at = now()
   WHERE id = _partner_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.partner_set_connect_account(uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_set_connect_account(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.partner_set_connect_status_by_account(
  _account_id text,
  _status text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF _status NOT IN ('not_started','pending','active','restricted') THEN
    RAISE EXCEPTION 'unknown payout account status %', _status;
  END IF;
  UPDATE public.partners
     SET stripe_connect_status = _status,
         stripe_connect_updated_at = now(),
         updated_at = now()
   WHERE stripe_connect_account_id = _account_id
   RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.partner_set_connect_status_by_account(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_set_connect_status_by_account(text, text) TO service_role;

-- ---------- payout run ----------
-- Reserves every unpaid line for one run, so a second run started at the same
-- time can never cover the same line twice. A partner whose payout account is
-- not verified is refused with a reason, not silently skipped.
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

CREATE OR REPLACE FUNCTION public.payout_settle(
  _payout_id uuid,
  _transfer_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
BEGIN
  -- The lines go back to unpaid so the next run picks them up again.
  UPDATE public.commission_ledger SET payout_id = NULL WHERE payout_id = _payout_id;
  UPDATE public.partner_payouts
     SET status = 'failed', error = left(coalesce(_error, 'unknown error'), 500)
   WHERE id = _payout_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payout_fail(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_fail(uuid, text) TO service_role;

-- ---------- clawback ----------
-- A refunded or disputed invoice reverses its commission. If the line was
-- never paid out it is simply marked clawed back; if the money already left,
-- an offsetting negative line nets against the partner's next payout.
CREATE OR REPLACE FUNCTION public.clawback_commission(
  _invoice_id text,
  _reason text,
  _environment text DEFAULT 'live'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row record; _new uuid;
BEGIN
  SELECT * INTO _row FROM public.commission_ledger
   WHERE invoice_id = _invoice_id AND environment = _environment
     AND clawback_of IS NULL
   ORDER BY created_at LIMIT 1;
  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_ledger_row');
  END IF;
  IF _row.status = 'clawed_back' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'ledger_id', _row.id);
  END IF;

  IF _row.status = 'paid' THEN
    INSERT INTO public.commission_ledger (
      partner_id, org_id, invoice_id, stripe_subscription_id,
      period_start, period_end, revenue_usd, rate_pct, commission_usd,
      status, environment, clawback_of, clawback_reason
    ) VALUES (
      _row.partner_id, _row.org_id, _invoice_id || ':clawback', _row.stripe_subscription_id,
      _row.period_start, _row.period_end, -_row.revenue_usd, _row.rate_pct, -_row.commission_usd,
      'pending', _environment, _row.id, left(coalesce(_reason, 'refunded'), 300)
    )
    ON CONFLICT (partner_id, invoice_id) DO NOTHING
    RETURNING id INTO _new;
  END IF;

  UPDATE public.commission_ledger
     SET status = 'clawed_back',
         clawback_reason = left(coalesce(_reason, 'refunded'), 300),
         payout_id = CASE WHEN status = 'paid' THEN payout_id ELSE NULL END
   WHERE id = _row.id;

  RETURN jsonb_build_object('ok', true, 'ledger_id', _row.id, 'offset_id', _new,
                            'netted_against_future_payout', _new IS NOT NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.clawback_commission(text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clawback_commission(text, text, text) TO service_role;