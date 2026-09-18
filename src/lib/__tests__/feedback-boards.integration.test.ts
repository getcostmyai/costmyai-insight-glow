/**
 * The partner feedback board is separated from the customer board at the
 * database boundary, not by a filtered query. This file proves that boundary
 * with real users, real sessions and real RLS. Nothing is mocked.
 *
 * Why all three tables are probed: the comment and vote policies key on
 * post_id, so hiding a post alone would still leak its thread. Each of the
 * three SELECT rules derives visibility from the parent post through the same
 * predicate, and each is read here as a non-partner.
 *
 * What a refusal looks like per probe, so nobody weakens an assertion without
 * seeing what it was for:
 *
 *   SELECT on a hidden row -> no error, zero rows. Postgres row-level security
 *     filters a SELECT rather than raising, so "refused" and "absent" cannot be
 *     distinguished on a read. The tests therefore assert zero rows AND assert
 *     with the service role that the row genuinely exists, which is what makes
 *     the empty result a refusal rather than a missing fixture.
 *
 *   INSERT with board 'partner' by a non-partner -> 42501, the row-level
 *     security refusal. The row offered is otherwise valid, so the policy is
 *     the only possible reason to fail. The test asserts 42501 and asserts the
 *     code is NOT 23514 (check violation), because a wrong category would be
 *     rejected by the CHECK constraint before any policy is consulted and would
 *     pass with RLS switched off.
 *
 *   Wrong category for the board -> 23514, the board-aware CHECK constraint.
 *     Asserted in both directions.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { guardIntegrationDatabase } from "./support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

const admin = createClient(URL, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});

guardIntegrationDatabase(admin);

const PASSWORD = "Test-Feedback-Boards-2026!";
const stamp = Date.now();

interface Actor {
  id: string;
  client: SupabaseClient;
}

async function makeActor(who: string): Promise<Actor> {
  const email = `feedback-${who}-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user!.id, client };
}

let partnerActor: Actor;
let customerActor: Actor;
let partnerId: string;
/** A partner-board post authored by the partner, plus one comment and one vote. */
let partnerPostId: string;
let partnerCommentId: string;
/** A customer-board post, for the "customers still see their board" check. */
let customerPostId: string;
const createdPosts: string[] = [];

beforeAll(async () => {
  [partnerActor, customerActor] = await Promise.all([makeActor("partner"), makeActor("customer")]);

  const partnerRow = await admin
    .from("partners")
    .insert({
      name: `Feedback Partner ${stamp}`,
      referral_code: `fbk-${stamp}`,
      status: "active",
      created_by: partnerActor.id,
    })
    .select("id")
    .single();
  if (partnerRow.error) throw partnerRow.error;
  partnerId = partnerRow.data.id as string;
  await admin
    .from("partner_users")
    .insert({ partner_id: partnerId, user_id: partnerActor.id, role: "owner" });

  // Authored by the partner, through the partner's own session: if the INSERT
  // policy were wrong this setup fails rather than the assertions.
  const post = await partnerActor.client
    .from("feedback_posts")
    .insert({
      board: "partner",
      title: `Named prospect pricing sheet ${stamp}`,
      body: "A client asked for a one page commission summary during a call.",
      category: "sales_materials",
      author_id: partnerActor.id,
    })
    .select("id")
    .single();
  if (post.error) throw post.error;
  partnerPostId = post.data.id as string;
  createdPosts.push(partnerPostId);

  const comment = await partnerActor.client
    .from("feedback_comments")
    .insert({
      post_id: partnerPostId,
      author_id: partnerActor.id,
      body: "The prospect was a named logo, so this cannot sit on the public board.",
    })
    .select("id")
    .single();
  if (comment.error) throw comment.error;
  partnerCommentId = comment.data.id as string;

  const vote = await partnerActor.client
    .from("feedback_votes")
    .insert({ post_id: partnerPostId, user_id: partnerActor.id });
  if (vote.error) throw vote.error;

  const custPost = await customerActor.client
    .from("feedback_posts")
    .insert({
      board: "customer",
      title: `Weekly spend digest ${stamp}`,
      body: "A short weekly email with the spend delta would save me opening the app.",
      category: "feature",
      author_id: customerActor.id,
    })
    .select("id")
    .single();
  if (custPost.error) throw custPost.error;
  customerPostId = custPost.data.id as string;
  createdPosts.push(customerPostId);
}, 90_000);

afterAll(async () => {
  await admin.from("feedback_posts").delete().in("id", createdPosts);
  await admin.from("partners").delete().eq("id", partnerId);
  for (const a of [partnerActor, customerActor]) await admin.auth.admin.deleteUser(a.id);
}, 90_000);

describe("partner board visibility", () => {
  it("hides a partner post, its comments and its votes from a customer", async () => {
    // The rows exist. Read with the service role first, so the empty results
    // below are a policy refusal rather than a fixture that never landed.
    const truth = await admin
      .from("feedback_posts")
      .select("id, board")
      .eq("id", partnerPostId)
      .single();
    expect(truth.error).toBeNull();
    expect(truth.data?.board).toBe("partner");

    const posts = await customerActor.client
      .from("feedback_posts")
      .select("id")
      .eq("id", partnerPostId);
    expect(posts.error).toBeNull();
    expect(posts.data).toEqual([]);

    const comments = await customerActor.client
      .from("feedback_comments")
      .select("id")
      .eq("post_id", partnerPostId);
    expect(comments.error).toBeNull();
    expect(comments.data).toEqual([]);
    // And the comment genuinely exists.
    const commentTruth = await admin
      .from("feedback_comments")
      .select("id")
      .eq("id", partnerCommentId)
      .single();
    expect(commentTruth.data?.id).toBe(partnerCommentId);

    const votes = await customerActor.client
      .from("feedback_votes")
      .select("post_id")
      .eq("post_id", partnerPostId);
    expect(votes.error).toBeNull();
    expect(votes.data).toEqual([]);
    const voteTruth = await admin
      .from("feedback_votes")
      .select("post_id")
      .eq("post_id", partnerPostId);
    expect(voteTruth.data?.length).toBe(1);
  });

  it("lets an active partner read and post on the partner board", async () => {
    const read = await partnerActor.client
      .from("feedback_posts")
      .select("id, title")
      .eq("id", partnerPostId)
      .maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(partnerPostId);

    const thread = await partnerActor.client
      .from("feedback_comments")
      .select("id")
      .eq("post_id", partnerPostId);
    expect(thread.data?.length).toBe(1);

    const wrote = await partnerActor.client
      .from("feedback_posts")
      .insert({
        board: "partner",
        title: `Referral flow drop off ${stamp}`,
        body: "Two prospects lost the code between the click and signing up.",
        category: "referral_flow",
        author_id: partnerActor.id,
      })
      .select("id")
      .single();
    expect(wrote.error).toBeNull();
    if (wrote.data?.id) createdPosts.push(wrote.data.id as string);
  });

  it("refuses a non-partner who posts board 'partner' directly", async () => {
    const attempt = await customerActor.client.from("feedback_posts").insert({
      board: "partner",
      title: `Not mine to post ${stamp}`,
      body: "A customer setting the board field by hand on an otherwise valid row.",
      category: "commission",
      author_id: customerActor.id,
    });
    expect(attempt.error).not.toBeNull();
    expect(attempt.error?.code).toBe("42501");
    expect(attempt.error?.code).not.toBe("23514");
  });
});

describe("board aware categories", () => {
  it("rejects a partner category on the customer board", async () => {
    const attempt = await customerActor.client.from("feedback_posts").insert({
      board: "customer",
      title: `Wrong category one ${stamp}`,
      body: "Commission is a partner category and has no meaning on the customer board.",
      category: "commission",
      author_id: customerActor.id,
    });
    expect(attempt.error?.code).toBe("23514");
  });

  it("rejects a customer category on the partner board", async () => {
    const attempt = await partnerActor.client.from("feedback_posts").insert({
      board: "partner",
      title: `Wrong category two ${stamp}`,
      body: "Integration is a customer category and has no meaning on the partner board.",
      category: "integration",
      author_id: partnerActor.id,
    });
    expect(attempt.error?.code).toBe("23514");
  });
});

describe("the customer board is unchanged", () => {
  it("still shows customer posts to a customer, including rows that predate the migration", async () => {
    const mine = await customerActor.client
      .from("feedback_posts")
      .select("id")
      .eq("id", customerPostId)
      .maybeSingle();
    expect(mine.error).toBeNull();
    expect(mine.data?.id).toBe(customerPostId);

    // Every customer-board row the service role can see is readable by a
    // signed-in customer too, so the migration narrowed nothing for them.
    const truth = await admin.from("feedback_posts").select("id").eq("board", "customer");
    const seen = await customerActor.client.from("feedback_posts").select("id").eq("board", "customer");
    expect(seen.error).toBeNull();
    expect(new Set((seen.data ?? []).map((r) => r.id))).toEqual(
      new Set((truth.data ?? []).map((r) => r.id)),
    );
  });
});
