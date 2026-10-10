// Runs every 15 minutes. pg_cron calls it with a secret kept in the database vault.
//  1. Places card holds on confirmed runs starting within 48 hours.
//  2. Pays runners for completed runs once the 24-hour dispute window has passed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import Stripe from "npm:stripe@17.7.0";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "sk_not_configured", { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  const { data: secret } = await db.rpc("cron_secret");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("Forbidden", { status: 403 });
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return new Response("Stripe not configured", { status: 503 });

  const results = { authorized: 0, paid: 0, errors: [] as string[] };

  // 1. holds for runs in the next 48 hours
  const soon = new Date(Date.now() + 48 * 3600_000).toISOString();
  const { data: upcoming } = await db.from("runs").select("*, payments(id)")
    .eq("status", "confirmed").lte("scheduled_at", soon);
  for (const run of upcoming ?? []) {
    if (run.payments?.length) continue;
    try {
      const { data: acct } = await db.from("payment_accounts").select("*").eq("profile_id", run.owner_id).maybeSingle();
      if (!acct?.stripe_customer_id) continue;
      const pms = await stripe.paymentMethods.list({ customer: acct.stripe_customer_id, type: "card", limit: 1 });
      if (!pms.data.length) continue;
      const intent = await stripe.paymentIntents.create({
        amount: run.owner_total_cents, currency: "usd", customer: acct.stripe_customer_id,
        payment_method: pms.data[0].id, off_session: true, confirm: true, capture_method: "manual",
        transfer_group: run.id, metadata: { run_id: run.id },
      }, { idempotencyKey: `authorize-${run.id}` });
      await db.from("payments").insert({
        run_id: run.id, stripe_payment_intent_id: intent.id, amount_cents: run.owner_total_cents,
        status: intent.status === "requires_capture" ? "authorized" : "failed",
      });
      results.authorized++;
    } catch (e) {
      results.errors.push(`authorize ${run.id}: ${(e as Error).message}`);
    }
  }

  // 2. runner payouts after the dispute window
  const { data: due } = await db.from("runs").select("*")
    .eq("status", "completed").is("payout_released_at", null).lte("dispute_open_until", new Date().toISOString());
  for (const run of due ?? []) {
    try {
      const { data: pay } = await db.from("payments").select("*").eq("run_id", run.id).maybeSingle();
      if (pay?.status !== "captured") continue;
      const { data: acct } = await db.from("payment_accounts").select("*").eq("profile_id", run.runner_id).maybeSingle();
      if (!acct?.stripe_account_id || !acct.payouts_enabled) continue;
      const t = await stripe.transfers.create({
        amount: run.runner_payout_cents, currency: "usd", destination: acct.stripe_account_id,
        transfer_group: run.id, metadata: { run_id: run.id },
      }, { idempotencyKey: `payout-${run.id}` });
      await db.from("payments").update({ transfer_id: t.id, updated_at: new Date().toISOString() }).eq("id", pay.id);
      await db.from("runs").update({ payout_released_at: new Date().toISOString() }).eq("id", run.id);
      results.paid++;
    } catch (e) {
      results.errors.push(`payout ${run.id}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
