CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket_key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limit_counters TO service_role;
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx
  ON public.rate_limit_counters (window_start);

CREATE OR REPLACE FUNCTION public.rate_limit_consume(
  _key TEXT,
  _limit INTEGER,
  _window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after_sec INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now TIMESTAMPTZ := now();
  _hits INTEGER;
  _start TIMESTAMPTZ;
BEGIN
  IF _key IS NULL OR length(_key) = 0 OR _limit < 1 OR _window_seconds < 1 THEN
    RAISE EXCEPTION 'rate_limit_consume: invalid arguments';
  END IF;

  -- One atomic statement: the row is inserted or the counter advanced under a
  -- single row lock, so concurrent workers share the same count.
  INSERT INTO public.rate_limit_counters AS r (bucket_key, window_start, hits, updated_at)
  VALUES (_key, _now, 1, _now)
  ON CONFLICT (bucket_key) DO UPDATE
    SET hits = CASE
          WHEN r.window_start + make_interval(secs => _window_seconds) <= _now THEN 1
          ELSE r.hits + 1
        END,
        window_start = CASE
          WHEN r.window_start + make_interval(secs => _window_seconds) <= _now THEN _now
          ELSE r.window_start
        END,
        updated_at = _now
  RETURNING r.hits, r.window_start INTO _hits, _start;

  RETURN QUERY SELECT
    _hits <= _limit,
    GREATEST(0, _limit - _hits),
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_start + make_interval(secs => _window_seconds) - _now)))::INTEGER);
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_consume(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_consume(TEXT, INTEGER, INTEGER) TO service_role;

-- Housekeeping: drop windows nobody has touched in a day.
CREATE OR REPLACE FUNCTION public.rate_limit_prune()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n INTEGER;
BEGIN
  DELETE FROM public.rate_limit_counters WHERE updated_at < now() - interval '1 day';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_prune() TO service_role;