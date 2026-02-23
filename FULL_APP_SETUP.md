# Full app setup before Base44 expires

Use this so **everything** works in your own app: revenue, profit/loss, patients seen, treatments, expenses, invoices, catalogue, reports, settings, consultant, quick add, voice diary. All data is stored in **your** Supabase project.

---

## 1. Run the full database schema (once)

This creates all tables and permissions so the app can read/write your data.

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** → your project (the one in `VITE_SUPABASE_URL`).
2. Go to **SQL Editor** → **New query**.
3. Open **`database/schema-full-rerun.sql`** in this repo and copy its **entire** contents into the editor.
4. Click **Run**.

You should see “Success” with no errors. After this, in **Table Editor** you should see: `profiles`, `patients`, `practitioners`, `treatment_catalog`, `treatment_entries`, `expenses`, `invoices`, `export_history`, `competitor_pricing`, `tax_settings`, `chat_history`, `subscriptions`, `payment_reminders`, `subscription_exemptions`.

---

## 2. App and env (Vercel)

- **Root directory:** If the repo root is not the app folder, in Vercel set **Root Directory** to `optifinance-app` (or the folder that contains `package.json` and `src/`).
- **Environment variables** (Vercel → Settings → Environment Variables):
  - `VITE_SUPABASE_URL` = your Supabase project URL (e.g. `https://xfkitnutpzhaamuaaelp.supabase.co`)
  - `VITE_SUPABASE_ANON_KEY` = your Supabase anon/public key
- **Redeploy** after changing env or root directory.

---

## 3. Supabase Edge Functions and secrets

So checkout, webhook, and post-payment sync work:

- **Secrets** (Supabase → Project Settings → Edge Functions → Secrets):
  - `STRIPE_SECRET_KEY` = your Stripe secret key
  - `STRIPE_WEBHOOK_SECRET` = webhook signing secret (Stripe → Developers → Webhooks → endpoint → Reveal)
  - `SITE_URL` = your app URL (e.g. `https://optifinance-app.vercel.app`) — no trailing slash

- **Deploy:**
  ```bash
  cd optifinance-app
  supabase functions deploy create-checkout-session --no-verify-jwt
  supabase functions deploy stripe-webhook --no-verify-jwt
  supabase functions deploy sync-checkout-session
  ```

- **Stripe:** Add webhook endpoint in Stripe (Developers → Webhooks) with URL  
  `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`  
  and events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

---

## 4. Free access (optional)

To use the app without a paid subscription while you test or migrate:

1. In Supabase go to **Authentication** → **Users** and copy your **User UID**.
2. In **SQL Editor** run (replace with your UUID):
   ```sql
   INSERT INTO subscription_exemptions (user_id) VALUES ('your-user-uuid-here');
   ```

---

## 5. What each part of the app uses

| Area | What it needs | Tables |
|------|----------------|--------|
| **Dashboard** | Revenue, profit, costs, patients seen, charts | `treatment_entries`, `expenses`, `treatment_catalog` |
| **Records** | Treatments & expenses list, edit, delete | `treatment_entries`, `expenses`, `patients`, `practitioners`, `treatment_catalog` |
| **Catalogue** | Treatments, practitioners, patients, recurring expenses | `treatment_catalog`, `practitioners`, `patients`, `expenses` |
| **Invoices** | Create, send, PDF, reminders | `invoices`, `treatment_entries`, `patients`, `payment_reminders` |
| **Reports** | Exports, reports | `treatment_entries`, `expenses`, `export_history` |
| **Settings** | Profile, bank, tax | `profiles`, `tax_settings` |
| **Consultant** | AI chat | `chat_history` |
| **Quick Add / Voice Diary** | Add treatments/patients | `treatment_entries`, `patients`, `treatment_catalog`, `practitioners` |
| **Billing / subscription** | Stripe, access control | `subscriptions`, `subscription_exemptions` |

All of the above tables are created by **`schema-full-rerun.sql`**. No Base44 dependency: the app uses your Supabase + OpenAI (consultant) and Stripe.

---

## 6. Your existing data (from Base44)

This app does **not** auto-import from Base44. To keep using your numbers:

- **Option A:** Export whatever you can from Base44 (CSV/Excel if available) and, if the format matches, you can re-import or paste into your new app (e.g. add treatments/patients in Catalogue, add treatment entries in Records or Quick Add).
- **Option B:** Start fresh in this app and use it from now on; all new data is stored in your Supabase.

---

## 7. Quick checklist

- [ ] Run **`database/schema-full-rerun.sql`** in Supabase SQL Editor.
- [ ] Confirm in **Table Editor** that all tables listed in section 5 exist.
- [ ] Set **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** on Vercel; set **Root Directory** if needed.
- [ ] Set Supabase secrets: **STRIPE_SECRET_KEY**, **STRIPE_WEBHOOK_SECRET**, **SITE_URL**.
- [ ] Deploy Edge Functions: **create-checkout-session**, **stripe-webhook**, **sync-checkout-session** (as in section 3).
- [ ] Add Stripe webhook endpoint and events (section 3).
- [ ] (Optional) Add yourself to **subscription_exemptions** (section 4).
- [ ] Redeploy the frontend (e.g. push to Git so Vercel deploys).
- [ ] Log in and test: add a treatment and a patient in Catalogue, add a treatment entry in Records or Quick Add, then open Dashboard and confirm revenue/profit/patients seen.

Once this is done, the app has full functionality with all data stored in your Supabase. You can cancel Base44 when ready.
