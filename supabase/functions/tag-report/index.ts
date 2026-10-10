// Reads a runner's post-run notes with Claude, tags them, and flags anything safety-related.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TAGS = [
  "Good run", "Pulled on leash", "Distracted", "Reactive to dogs", "Reactive to people", "Reactive to bikes",
  "Potty done", "Hydration break", "Tired early", "Kept a strong pace", "Heat stress", "Possible soreness or injury",
  "Ate something on the route", "Slipped the leash",
];
const SAFETY = new Set(["Heat stress", "Possible soreness or injury", "Ate something on the route", "Slipped the leash"]);

Deno.serve(async (req) => {
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in first" }, 401);

  const { run_id } = await req.json().catch(() => ({}));
  const { data: report } = await db.from("run_reports").select("*, runs(owner_id, match_id)").eq("run_id", run_id).maybeSingle();
  if (!report || report.runner_id !== user.id) return json({ error: "Report not found" }, 404);
  if (!report.notes?.trim()) return json({ tags: [], flagged: false });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Report tagging is not set up yet. Add ANTHROPIC_API_KEY to the Edge Function secrets." }, 503);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5",
      max_tokens: 300,
      system: "You tag dog-run reports written by paid dog runners. Reply with JSON only: " +
        '{"tags": string[], "summary": string}. Choose tags only from this list: ' + JSON.stringify(TAGS) +
        ". The summary is one short sentence for the dog's owner.",
      messages: [{ role: "user", content: report.notes.slice(0, 2000) }],
    }),
  });
  if (!res.ok) return json({ error: `Tagging failed (${res.status})` }, 502);
  const out = await res.json();
  let parsed: { tags?: string[]; summary?: string } = {};
  try {
    const text = out.content?.[0]?.text ?? "{}";
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch { parsed = {}; }

  const tags = (parsed.tags ?? []).filter((t) => TAGS.includes(t));
  const flagged = tags.some((t) => SAFETY.has(t));
  await db.from("run_reports").update({ ai_tags: tags, ai_flagged: flagged }).eq("run_id", run_id);

  if (flagged) {
    await db.from("messages").insert({
      match_id: report.runs.match_id,
      body: `Safety note from the run report: ${tags.filter((t) => SAFETY.has(t)).join(", ")}. Check the report for details.`,
    });
    await db.from("user_reports").insert({
      reporter_id: user.id, target_profile_id: report.runs.owner_id, match_id: report.runs.match_id,
      reason: "run_safety_flag", details: report.notes.slice(0, 2000),
    });
  }
  return json({ tags, flagged, summary: parsed.summary ?? null });
});
