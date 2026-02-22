# OptiFinance setup checklist

Use this to see **where you’re at** and **what’s left** for a fully working app (login + pay + access after paying).  
Tick or note each item as you verify it. For *how* to do each step, see **DEPLOYMENT.md**.

---

## 1. Local / repo

| Done? | Item |
|-------|------|
| ☐ | You have a Supabase project (URL + anon key). |
| ☐ | You have a `.env` in `optifinance-app` with at least `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (real values, not placeholders). |
| ☐ | Optional: `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PRICE_ID_MONTHLY`, `VITE_STRIPE_PRICE_ID_ANNUAL` in `.env` if you want payments. |
| ☐ | `npm install` and `npm run dev` work; app loads at `http://localhost:5173`. |

**If something above is missing:** create a Supabase project, copy URL + anon key into `.env`, run schema (step 2) then retry.

---

## 2. Supabase – project & database

| Done? | Item |
|-------|------|
| ☐ | In Supabase **SQL Editor**: ran the full `database/schema.sql` (so `profiles`, `subscriptions`, and other tables exist). |
| ☐ | **Storage**: bucket named `files` exists and is public (or has correct RLS). |

**If schema wasn’t run:** Supabase → SQL Editor → paste `database/schema.sql` → Run.

---

## 3. Supabase – authentication (fixes “localhost” auth errors)

| Done? | Item |
|-------|------|
| ☐ | **Authentication → URL Configuration**: **Site URL** is your **live app URL** (e.g. `https://your-app.vercel.app`), not `http://localhost:5173`. |
| ☐ | **Redirect URLs** include your live base URL and at least: `/`, `/Auth`, `/Billing`, `/Checkout`, `/SubscriptionPricing`. |

**If you only use the app on localhost for now:** you can set Site URL to `http://localhost:5173` and add that to Redirect URLs; switch to the live URL once you deploy.

---

## 4. Vercel (or other host) – app live and env vars

| Done? | Item |
|-------|------|
| ☐ | App is deployed (e.g. Vercel); you have a live URL (e.g. `https://xxx.vercel.app`). |
| ☐ | **Project → Settings → Environment Variables** has: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. |
| ☐ | Optional (for Stripe): `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PRICE_ID_MONTHLY`, `VITE_STRIPE_PRICE_ID_ANNUAL`. |
| ☐ | You **redeployed** after adding/changing env vars. |

---

## 5. Stripe – account and product

| Done? | Item |
|-------|------|
| ☐ | Stripe account created (stripe.com). |
| ☐ | **Developers → API keys**: you have **Publishable key** (`pk_`) and **Secret key** (`sk_`). |
| ☐ | **Products**: at least one product with a **Price** (e.g. monthly £29); you have the **Price ID** (`price_...`). |
| ☐ | Publishable key and Price ID(s) are in Vercel env vars (and in `.env` for local). |

---

## 6. Supabase Edge Functions – checkout and webhook

| Done? | Item |
|-------|------|
| ☐ | **Supabase CLI**: `supabase login` and `supabase link --project-ref YOUR_REF` done. |
| ☐ | **Secrets** set (Dashboard → Project Settings → Edge Functions → Secrets, or CLI): `STRIPE_SECRET_KEY`, `SITE_URL` (your live app URL). |
| ☐ | **Deployed**: `supabase functions deploy create-checkout-session` (and optionally `stripe-webhook`, `create-billing-portal-session`). |
| ☐ | **Stripe webhook** (Developers → Webhooks): endpoint = `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`; events include `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`; **Signing secret** (`whsec_...`) is set in Supabase secrets as `STRIPE_WEBHOOK_SECRET`. |

**If checkout fails with “Failed to send a request to the Edge Function”:** deploy `create-checkout-session` and set `STRIPE_SECRET_KEY` + `SITE_URL` (see DEPLOYMENT.md).

---

## 7. End-to-end flow (what “working app after paying” means)

| Done? | Item |
|-------|------|
| ☐ | Open app at **live URL** → not logged in → redirected to **Auth**. |
| ☐ | Sign up or log in → redirected into the app (or to **SubscriptionPricing** if no subscription). |
| ☐ | From **SubscriptionPricing** or **Pricing** → choose plan → **Checkout** → redirect to Stripe. |
| ☐ | Pay with test card `4242 4242 4242 4242` → redirect back to app (e.g. **Billing** or home). |
| ☐ | **subscriptions** table in Supabase has a row for that user with `status = 'active'` (or `trialing`). |
| ☐ | With active subscription you can use the full app (Dashboard, Catalog, etc.) without being sent back to pricing. |

---

## Quick reference – env vars

**Frontend (Vercel + .env):**

- `VITE_SUPABASE_URL` – Supabase project URL  
- `VITE_SUPABASE_ANON_KEY` – Supabase anon key  
- `VITE_STRIPE_PUBLISHABLE_KEY` – Stripe `pk_...`  
- `VITE_STRIPE_PRICE_ID_MONTHLY` – Stripe `price_...` (monthly)  
- `VITE_STRIPE_PRICE_ID_ANNUAL` – Stripe `price_...` (annual, optional)  

**Supabase Edge Functions (secrets):**

- `STRIPE_SECRET_KEY` – Stripe `sk_...`  
- `SITE_URL` – e.g. `https://your-app.vercel.app`  
- `STRIPE_WEBHOOK_SECRET` – Stripe `whsec_...` (for `stripe-webhook`)  
- `SUPABASE_SERVICE_ROLE_KEY` – if your functions need it  

---

**Next step:** Go through each section and tick what you’ve already done; whatever is unticked is what you still need to do. Use **DEPLOYMENT.md** for the exact steps.
