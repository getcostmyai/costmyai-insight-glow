/**
 * Real k-anonymity boundary drill.
 *
 * Stands up genuine 4-company and 5-company cohorts in the real database —
 * real orgs, real profiles, real (non-synthetic) rollups — and reads the floor
 * behaviour at the exact 4-vs-5 boundary, which had only ever been reasoned
 * about from the function body or exercised against an injected stub.
 *
 * It also proves the caller-scoped wrapper: a signed-in caller can only ever
 * resolve their own workspace's cell, and `benchmark_cut` itself is no longer
 * callable with free parameters.
 *
 * Everything created here is deleted again in a finally block.
 */
const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const USER_TOKEN = process.env["LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN"];
const ANON = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;

const MARK = `boundary-${Date.now()}`;
const INDUSTRY = `__k_boundary_${Date.now()}`;
const BAND = "1m_10m";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function rest(path: string, init: RequestInit & { key?: string; token?: string } = {}) {
  const key = init.key ?? SERVICE;
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${init.token ?? key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const cut = (industry: string) =>
  rest(`/rest/v1/rpc/benchmark_cut`, {
    method: "POST",
    body: JSON.stringify({ _industry: industry, _use_case: "customer_facing", _revenue_band: BAND }),
  });

const orgIds: string[] = [];

async function addCompany(i: number) {
  const org = await rest(`/rest/v1/organizations`, {
    method: "POST",
    body: JSON.stringify({
      name: `${MARK}-co${i}`,
      slug: `${MARK}-co${i}`,
      plan: "compare",
      is_synthetic: false,
    }),
  });
  const id = (org.body as { id: string }[])[0]!.id;
  orgIds.push(id);
  await rest(`/rest/v1/org_profiles`, {
    method: "POST",
    body: JSON.stringify({
      org_id: id,
      industry: INDUSTRY,
      use_case: "customer_facing",
      revenue_band: BAND,
    }),
  });
  await rest(`/rest/v1/usage_rollups`, {
    method: "POST",
    body: JSON.stringify({
      org_id: id,
      bucket_start: new Date(Date.now() - 86_400_000).toISOString(),
      granularity: "day",
      model_key: "anthropic/claude-opus-4-5",
      host: "anthropic",
      task_hint: "code",
      requests: 10,
      input_tokens: 1000,
      output_tokens: 1000,
      cost_usd: 100 * i,
      is_synthetic: false,
    }),
  });
}

async function main() {
  try {
    for (let i = 1; i <= 4; i++) await addCompany(i);
    const four = ((await cut(INDUSTRY)).body as any[])[0];
    check("4-company cohort publishes no percentiles", four.p50_usd === null, JSON.stringify(four));
    check("4-company cohort publishes no raw count", Number(four.company_count) === 0, `count ${four.company_count}`);

    await addCompany(5);
    const five = ((await cut(INDUSTRY)).body as any[])[0];
    check("5-company cohort clears the floor", Number(five.company_count) === 5, JSON.stringify(five));
    check("5-company cohort publishes percentiles", five.p50_usd !== null, `p50 ${five.p50_usd}`);

    // The wrapper: free parameters are gone, and the raw function is closed.
    if (USER_TOKEN) {
      const direct = await rest(`/rest/v1/rpc/benchmark_cut`, {
        method: "POST",
        key: ANON,
        token: USER_TOKEN,
        body: JSON.stringify({ _industry: INDUSTRY, _use_case: null, _revenue_band: null }),
      });
      check(
        "signed-in caller cannot call benchmark_cut with free parameters",
        direct.status >= 400,
        `${direct.status} ${JSON.stringify(direct.body)}`,
      );

      const foreign = await rest(`/rest/v1/rpc/benchmark_cut_self`, {
        method: "POST",
        key: ANON,
        token: USER_TOKEN,
        body: JSON.stringify({ _org_id: orgIds[0] }),
      });
      check(
        "wrapper refuses another workspace's org id",
        foreign.status >= 400,
        `${foreign.status} ${JSON.stringify(foreign.body)}`,
      );

      const extra = await rest(`/rest/v1/rpc/benchmark_cut_self`, {
        method: "POST",
        key: ANON,
        token: USER_TOKEN,
        body: JSON.stringify({ _org_id: orgIds[0], _industry: INDUSTRY }),
      });
      check(
        "wrapper has no profile parameters to smuggle a foreign cell through",
        extra.status >= 400,
        `${extra.status} ${JSON.stringify(extra.body)}`,
      );
    } else {
      console.log("SKIP  wrapper checks — no signed-in session in this sandbox");
    }

    const anonCall = await rest(`/rest/v1/rpc/benchmark_cut_self`, {
      method: "POST",
      key: ANON,
      body: JSON.stringify({ _org_id: orgIds[0] }),
    });
    check("anonymous caller cannot reach the wrapper", anonCall.status >= 400, `${anonCall.status}`);
  } finally {
    for (const id of orgIds) {
      await rest(`/rest/v1/usage_rollups?org_id=eq.${id}`, { method: "DELETE" });
      await rest(`/rest/v1/org_profiles?org_id=eq.${id}`, { method: "DELETE" });
      await rest(`/rest/v1/organizations?id=eq.${id}`, { method: "DELETE" });
    }
    const leftovers = await rest(`/rest/v1/organizations?slug=like.${MARK}%25&select=id`);
    console.log(`cleanup: ${JSON.stringify(leftovers.body)}`);
  }
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
