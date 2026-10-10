// Where Stripe sends runners after payout onboarding. Hands them back to the app.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req) => {
  const state = new URL(req.url).searchParams.get("state") === "refresh" ? "refresh" : "done";
  const deepLink = `pawpace://payouts?state=${state}`;
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PawPace payouts</title>
<body style="font-family:-apple-system,system-ui,sans-serif;padding:32px;text-align:center">
<h1 style="font-size:24px">${state === "done" ? "Payout setup saved" : "Let's try that again"}</h1>
<p>Return to PawPace to continue.</p>
<p><a href="${deepLink}" style="display:inline-block;background:#2B3BFF;color:#fff;padding:14px 22px;border-radius:14px;text-decoration:none;font-weight:700">Open PawPace</a></p>
<script>location.href=${JSON.stringify(deepLink)}</script></body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});
