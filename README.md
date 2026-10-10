# PawPace

Running buddies for your dog. An iOS app that matches dog owners with local runners who get paid to take dogs on runs.

- **App:** Expo SDK 57 (React Native, Expo Router, TypeScript), in `src/`
- **Backend:** Supabase project `taywuqiufuyutttukfyj` (Postgres with row-level security, Auth, Storage, Realtime, Edge Functions), in `supabase/`
- **Payments:** Stripe Connect Express (separate charges and transfers)
- **Report tagging:** Claude API, from the `tag-report` edge function

## Run it on your iPhone

1. Install [Node.js 20+](https://nodejs.org) and, on your iPhone, **Expo Go** from the App Store.
2. In this folder:
   ```bash
   npm install
   cp .env.example .env      # Supabase values are filled in; add your Stripe publishable key
   npx expo start
   ```
3. Scan the QR code with your iPhone camera.

Expo Go covers sign-in by email, profiles, photos, swiping, chat, runs and maps. Sign in with Apple, card payments and background location need a **development build** (`npx expo run:ios` on a Mac with Xcode, or `npx eas-cli@latest build --profile development`).

## What's already live in Supabase

| Piece | Status |
| --- | --- |
| Database: 29 tables, security rules on every table | Applied (`supabase/migrations/`) |
| Matching, booking, cancellation, rating, dispute logic | Applied as database functions and tested |
| Photo storage (`photos` public, `private` for chat and report photos) | Applied |
| Pricing tiers for DC and Denver, 15% commission, $2.99 booking fee | Seeded; edit in the `pricing_tiers` and `platform_settings` tables |
| Edge functions: `payments`, `scheduler`, `stripe-webhook`, `stripe-return`, `tag-report`, `delete-account` | Deployed |
| Scheduler every 15 minutes (card holds 48 hours before runs, runner payouts after the 24-hour dispute window) | Running |

## Setup steps still needed (in the Supabase and Stripe dashboards)

1. **Stripe keys.** In Stripe, turn on Connect, then copy your **test** secret key. In Supabase go to Edge Functions → Secrets and add `STRIPE_SECRET_KEY`. Put the matching publishable key (`pk_test_...`) in `.env` as `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
2. **Stripe webhook.** In Stripe → Developers → Webhooks, add endpoint
   `https://taywuqiufuyutttukfyj.supabase.co/functions/v1/stripe-webhook` with events `account.updated`, `payment_intent.payment_failed`, `payment_intent.canceled`. Add its signing secret to Supabase secrets as `STRIPE_WEBHOOK_SECRET`.
3. **Claude API key** (report tagging). Add `ANTHROPIC_API_KEY` to Supabase secrets.
4. **Email sign-in codes.** Supabase → Authentication → Email Templates → Magic Link: include `{{ .Token }}` so the email shows a 6-digit code. Before the beta, set up custom SMTP (Authentication → SMTP) because the built-in sender is rate-limited.
5. **Sign in with Apple.** Needs the Apple Developer account. Then enable the Apple provider in Supabase → Authentication → Providers with your bundle ID (`com.pawpace.app`, change in `app.json` if you prefer).
6. **Make yourself an admin** (for the dashboard): after you sign in once, run in the SQL editor:
   `insert into admins (profile_id) select id from auth.users where email = 'you@example.com';`

## How the money works

- Owner saves a card once (Stripe PaymentSheet). When a run is accepted, a hold is placed for the total (or 48 hours before, for runs more than 6 days out).
- The run report captures the charge. The runner's share is transferred 24 hours later unless the owner opens a dispute.
- Cancellations follow the policy in `cancel_run()`: weather is always free; owner 12+ hours free, 2–12 hours half, under 2 hours full; runner late cancels and no-shows give a strike (3 in 30 days suspends).
- Tips go to the runner minus Stripe's card fee (2.9% + 30¢).

## Project layout

```
src/app/            screens (Expo Router): sign-in, onboarding, tabs, chat, lock-in, run, live, report, rate, cancel
src/components/     UI kit, swipe card, photo grid, run card
src/lib/            Supabase client, session, payments, photos, calendar, formatting
supabase/migrations database schema, security rules and logic
supabase/functions  edge functions
```

## Not built yet (next phase)

- Push notifications sending (tokens table is ready)
- Background location during runs (currently records while the app is open)
- Admin dashboard (Lovable or Next.js on this database)
- Runners aged 14 to 17 with a guardian, background checks, insurance (marked "coming soon" in the app)
- GPX and Apple Health route import
