ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_event_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_id text;

CREATE OR REPLACE FUNCTION public.apply_subscription_event(
  _org_id uuid,
  _user_id uuid,
  _subscription_id text,
  _customer_id text,
  _product_id text,
  _price_id text,
  _plan plan_tier,
  _status text,
  _period_start timestamptz,
  _period_end timestamptz,
  _cancel_at_period_end boolean,
  _environment text,
  _event_created timestamptz,
  _event_id text,
  _next_plan plan_tier
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied boolean;
  v_prev_org_plan plan_tier;
  v_stored timestamptz;
  v_stored_status text;
BEGIN
  SELECT plan INTO v_prev_org_plan FROM organizations WHERE id = _org_id;

  SELECT last_event_created_at, status INTO v_stored, v_stored_status
  FROM subscriptions WHERE stripe_subscription_id = _subscription_id;

  -- One atomic statement. The conflict target takes a row lock, so two
  -- handlers racing in separate isolates are serialised here and the loser
  -- re-evaluates the guard against the winner's already-written timestamp.
  INSERT INTO subscriptions (
    org_id, user_id, stripe_subscription_id, stripe_customer_id, product_id,
    price_id, plan, status, current_period_start, current_period_end,
    cancel_at_period_end, environment, last_event_created_at, last_event_id, updated_at
  ) VALUES (
    _org_id, _user_id, _subscription_id, _customer_id, _product_id,
    _price_id, _plan, _status, _period_start, _period_end,
    COALESCE(_cancel_at_period_end, false), _environment, _event_created, _event_id, now()
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    user_id = EXCLUDED.user_id,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    product_id = EXCLUDED.product_id,
    price_id = EXCLUDED.price_id,
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    environment = EXCLUDED.environment,
    last_event_created_at = EXCLUDED.last_event_created_at,
    last_event_id = EXCLUDED.last_event_id,
    updated_at = now()
  WHERE subscriptions.last_event_created_at IS NULL
     OR subscriptions.last_event_created_at < EXCLUDED.last_event_created_at
     -- Provider timestamps have one-second resolution, so a tie is possible
     -- between a cancellation and an update raised in the same second. On a
     -- tie the terminal state wins: a cancelled subscription is never
     -- resurrected by an equally-timed non-cancellation.
     OR (subscriptions.last_event_created_at = EXCLUDED.last_event_created_at
         AND NOT (subscriptions.status = 'canceled' AND EXCLUDED.status <> 'canceled'))
  RETURNING true INTO v_applied;

  IF v_applied IS NULL THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'stale_event',
      'stored_event_created_at', v_stored,
      'stored_status', v_stored_status,
      'previous_plan', v_prev_org_plan
    );
  END IF;

  -- The workspace level moves in the same transaction as the subscription row
  -- it is derived from, so the two can never disagree after a race.
  UPDATE organizations SET
    plan = _next_plan,
    stripe_customer_id = _customer_id,
    stripe_subscription_id = _subscription_id,
    plan_valid_until = _period_end,
    updated_at = now()
  WHERE id = _org_id;

  RETURN jsonb_build_object(
    'applied', true,
    'previous_plan', v_prev_org_plan,
    'stored_event_created_at', v_stored,
    'stored_status', v_stored_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_event(uuid, uuid, text, text, text, text, plan_tier, text, timestamptz, timestamptz, boolean, text, timestamptz, text, plan_tier) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_event(uuid, uuid, text, text, text, text, plan_tier, text, timestamptz, timestamptz, boolean, text, timestamptz, text, plan_tier) TO service_role;