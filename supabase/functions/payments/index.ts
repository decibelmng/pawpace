// PawPace payments: one function, several actions, called from the app with the user's session.
//   setup_card      owner saves a card for off-session run charges (returns PaymentSheet params)
//   onboard_runner  runner opens Stripe Express onboarding for payouts
//   authorize_run   place the hold on the owner's card for a confirmed run
//   capture_run     charge the hold after the run report is filed
//   settle_cancel   charge or release the hold after a cancellation, pay the runner's share
//   tip             owner tips the runner; Stripe's fee comes out of the tip
//
// Money model: separate charges and transfers. Runs are charged to the platform account,
// and the runner's share is transferred after the 24-hour dispute window (see `scheduler`).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import Stripe from "npm:stripe@17.7.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const EPHEMERAL_KEY_API_VERSION = "2024-06-20";

const stripe = new Stripe(STRIPE_KEY || "sk_not_configured", { httpClient: Stripe.createFetchHttpClient() });
const db = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class UserError extends Error {}

async function getAccount(profileId: string) {
  const { data } = await db.from("payment_accounts").select("*").eq("profile_id", profileId).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db.from("payment_accounts")
    .insert({ profile_id: profileId }).select("*").single();
  if (error) throw error;
  return created;
}

async function ensureCustomer(profileId: string, email?: string) {
  const acct = await getAccount(profileId);
  if (acct.stripe_customer_id) return acct.stripe_customer_id as string;
  const customer = await stripe.customers.create({ email, metadata: { profile_id: profileId } });
  await db.from("payment_accounts").update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq("profile_id", profileId);
  return customer.id;
}

async function defaultCard(customerId: string) {
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  if (!methods.data.length) throw new UserError("Add a card in Profile before booking runs");
  return methods.data[0].id;
}

async function loadRun(runId: string, userId: string) {
  const { data: run } = await db.from("runs").select("*").eq("id", runId).maybeSingle();
  if (!run || ![run.owner_id, run.runner_id].includes(userId)) throw new UserError("Run not found");
  return run;
}

async function authorizeRun(run: Record<string, any>) {
  const { data: existing } = await db.from("payments").select("id").eq("run_id", run.id).maybeSingle();
  if (existing) return { status: "already_authorized" };
  const acct = await getAccount(run.owner_id);
  if (!acct.stripe_customer_id) throw new UserError("The owner needs to add a card first");
  const pm = await defaultCard(acct.stripe_customer_id);
  const intent = await stripe.paymentIntents.create({
    amount: run.owner_total_cents,
    currency: "usd",
    customer: acct.stripe_customer_id,
    payment_method: pm,
    off_session: true,
    confirm: true,
    capture_method: "manual",
    transfer_group: run.id,
    description: `PawPace run ${run.id}`,
    metadata: { run_id: run.id },
  }, { idempotencyKey: `authorize-${run.id}` });
  await db.from("payments").insert({
    run_id: run.id,
    stripe_payment_intent_id: intent.id,
    status: intent.status === "requires_capture" ? "authorized" : "failed",
    amount_cents: run.owner_total_cents,
  });
  return { status: intent.status };
}

async function transferToRunner(runnerId: string, amount: number, runId: string, key: string) {
  if (amount <= 0) return null;
  const acct = await getAccount(runnerId);
  if (!acct.stripe_account_id || !acct.payouts_enabled) return null;   // released later by the scheduler
  const t = await stripe.transfers.create({
    amount, currency: "usd", destination: acct.stripe_account_id, transfer_group: runId,
    metadata: { run_id: runId },
  }, { idempotencyKey: key });
  return t.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!STRIPE_KEY) {
    return json({ error: "Payments are not set up yet. Add STRIPE_SECRET_KEY to the Edge Function secrets." }, 503);
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in first" }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Send a JSON body" }, 400); }

  try {
    switch (body.action) {
      case "setup_card": {
        const customer = await ensureCustomer(user.id, user.email ?? undefined);
        const ephemeralKey = await stripe.ephemeralKeys.create({ customer }, { apiVersion: EPHEMERAL_KEY_API_VERSION });
        const setupIntent = await stripe.setupIntents.create({
          customer, usage: "off_session", automatic_payment_methods: { enabled: true },
        });
        return json({
          customer, ephemeralKey: ephemeralKey.secret, setupIntent: setupIntent.client_secret,
          publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? null,
        });
      }

      case "onboard_runner": {
        const acct = await getAccount(user.id);
        let accountId = acct.stripe_account_id as string | null;
        if (!accountId) {
          const account = await stripe.accounts.create({
            type: "express", country: "US", email: user.email ?? undefined,
            business_type: "individual",
            capabilities: { transfers: { requested: true } },
            metadata: { profile_id: user.id },
          });
          accountId = account.id;
          await db.from("payment_accounts").update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
            .eq("profile_id", user.id);
        }
        const back = `${SUPABASE_URL}/functions/v1/stripe-return`;
        const link = await stripe.accountLinks.create({
          account: accountId, type: "account_onboarding",
          refresh_url: `${back}?state=refresh`, return_url: `${back}?state=done`,
        });
        return json({ url: link.url });
      }

      case "authorize_run": {
        const run = await loadRun(body.run_id, user.id);
        if (run.status !== "confirmed") throw new UserError("Only confirmed runs are authorized");
        const daysOut = (new Date(run.scheduled_at).getTime() - Date.now()) / 86_400_000;
        if (daysOut > 6) return json({ status: "scheduled", note: "The card hold is placed 48 hours before the run." });
        return json(await authorizeRun(run));
      }

      case "capture_run": {
        const run = await loadRun(body.run_id, user.id);
        if (run.status !== "completed") throw new UserError("The run is not complete yet");
        const { data: pay } = await db.from("payments").select("*").eq("run_id", run.id).maybeSingle();
        if (!pay) throw new UserError("No card hold found for this run");
        if (pay.status === "captured") return json({ status: "captured" });
        const intent = await stripe.paymentIntents.capture(pay.stripe_payment_intent_id, {},
          { idempotencyKey: `capture-${run.id}` });
        await db.from("payments").update({
          status: "captured", captured_cents: intent.amount_received, updated_at: new Date().toISOString(),
        }).eq("id", pay.id);
        return json({ status: "captured" });
      }

      case "settle_cancel": {
        const run = await loadRun(body.run_id, user.id);
        if (run.status !== "cancelled") throw new UserError("The run is not cancelled");
        const { data: pay } = await db.from("payments").select("*").eq("run_id", run.id).maybeSingle();
        if (!pay || pay.status !== "authorized") return json({ status: "nothing_to_settle" });
        const charge = run.owner_total_cents - (run.refund_cents ?? run.owner_total_cents);
        if (charge <= 0) {
          await stripe.paymentIntents.cancel(pay.stripe_payment_intent_id);
          await db.from("payments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", pay.id);
          return json({ status: "released" });
        }
        const intent = await stripe.paymentIntents.capture(pay.stripe_payment_intent_id,
          { amount_to_capture: charge }, { idempotencyKey: `cancel-capture-${run.id}` });
        const transferId = await transferToRunner(run.runner_id, run.runner_comp_cents ?? 0, run.id, `cancel-transfer-${run.id}`);
        await db.from("payments").update({
          status: "partially_refunded", captured_cents: intent.amount_received,
          refunded_cents: run.owner_total_cents - intent.amount_received,
          transfer_id: transferId, updated_at: new Date().toISOString(),
        }).eq("id", pay.id);
        if (transferId) await db.from("runs").update({ payout_released_at: new Date().toISOString() }).eq("id", run.id);
        return json({ status: "charged", charged_cents: charge });
      }

      case "tip": {
        const run = await loadRun(body.run_id, user.id);
        const amount = Math.round(Number(body.amount_cents));
        if (user.id !== run.owner_id) throw new UserError("Only the owner can tip");
        if (!["completed", "disputed"].includes(run.status)) throw new UserError("Tip after the run is complete");
        if (!Number.isFinite(amount) || amount < 100 || amount > 20000) throw new UserError("Tips are $1 to $200");
        const customer = await ensureCustomer(user.id, user.email ?? undefined);
        const intent = await stripe.paymentIntents.create({
          amount, currency: "usd", customer, payment_method: await defaultCard(customer),
          off_session: true, confirm: true, transfer_group: run.id, description: `PawPace tip for run ${run.id}`,
          metadata: { run_id: run.id, kind: "tip" },
        });
        // Stripe's card fee (2.9% + 30¢) comes out of the tip; the runner gets the rest.
        const fee = Math.round(amount * 0.029 + 30);
        const transferId = await transferToRunner(run.runner_id, amount - fee, run.id, `tip-${intent.id}`);
        await db.from("tips").insert({
          run_id: run.id, owner_id: run.owner_id, runner_id: run.runner_id, amount_cents: amount,
          stripe_payment_intent_id: intent.id, status: intent.status === "succeeded" ? "succeeded" : "failed",
        });
        return json({ status: intent.status, runner_receives_cents: amount - fee, transferred: !!transferId });
      }

      default:
        throw new UserError("Unknown action");
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = e instanceof UserError ? 400 : 500;
    console.error(body.action, message);
    return json({ error: message }, status);
  }
});
