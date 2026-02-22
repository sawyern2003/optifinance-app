# Stripe webhook setup (correct link and steps)

The webhook is what tells your app when a customer has paid. It does **not** fix the 401 on checkout (that’s auth/env). Use this to set it up correctly.

---

## 1. Webhook URL (your project)

Your Supabase project ref is **xfkitnutpzhaamuaaelp**. The Edge Function is **stripe-webhook**.

**Use this exact URL in Stripe:**

```
https://xfkitnutpzhaamuaaelp.supabase.co/functions/v1/stripe-webhook
```

- No trailing slash  
- `https`, not `http`  
- Must be the **stripe-webhook** function (not create-checkout-session)

---

## 2. Create the endpoint in Stripe

1. Go to **[Stripe Dashboard](https://dashboard.stripe.com)** and sign in.
2. Turn **Test mode** ON (toggle top-right) if you’re testing with test cards.
3. Open **Developers** → **Webhooks**.
4. Click **Add endpoint**.
5. **Endpoint URL:** paste  
   `https://xfkitnutpzhaamuaaelp.supabase.co/functions/v1/stripe-webhook`
6. Click **Select events** and add:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
7. Click **Add endpoint**.

---

## 3. Get the signing secret

1. On the **Webhooks** page, click the endpoint you just created.
2. Under **Signing secret**, click **Reveal**.
3. Copy the value (starts with **whsec_**).  
   This is your **webhook signing secret**.

---

## 4. Put the secret in Supabase

In the terminal (from your app folder):

```bash
cd "/Users/nicholassawyer/Desktop/optifinance latest/optifinance-app"
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_paste_the_full_secret_here
```

Paste the **entire** secret (including `whsec_`). No quotes.

---

## 5. Deploy the function (required: `--no-verify-jwt`)

Stripe calls your webhook **without** a user JWT, so the Supabase gateway would reject the request unless you disable JWT verification for this function. The function still verifies every request using the **Stripe signature** and `STRIPE_WEBHOOK_SECRET`, so it stays secure.

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

---

## 6. Test (optional)

In Stripe → your webhook → **Send test webhook** → choose `checkout.session.completed` and send. In Supabase Dashboard → **Logs** → **Edge Functions** → **stripe-webhook** you should see a log (and no errors if the secret matches).

---

## Summary

| Step | What |
|------|------|
| URL in Stripe | `https://xfkitnutpzhaamuaaelp.supabase.co/functions/v1/stripe-webhook` |
| Events | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` |
| Secret | Copy from Stripe → Reveal signing secret → set in Supabase: `STRIPE_WEBHOOK_SECRET=whsec_...` |
| Deploy | `supabase functions deploy stripe-webhook --no-verify-jwt` |

---

## Verify it's in place

Before going live, confirm:

1. **Stripe Dashboard → Developers → Webhooks:** One endpoint with URL  
   `https://xfkitnutpzhaamuaaelp.supabase.co/functions/v1/stripe-webhook`  
   and events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
2. **Supabase:** Secret `STRIPE_WEBHOOK_SECRET` is set (Dashboard → Project Settings → Edge Functions → Secrets, or `supabase secrets list`).
3. **Deployed:** `stripe-webhook` is deployed with `--no-verify-jwt` (step 5).
4. **Table:** The `subscriptions` table exists in your project (see `database/schema.sql`). If you haven't run migrations, run them so the webhook can upsert rows.

After a successful payment, Stripe sends `checkout.session.completed` to this URL; the function creates/updates the `subscriptions` row so the app sees `status === 'active'` and grants access.

**Backup (so you don't lose access if the webhook fails):** After payment, Stripe redirects to `Billing?success=true&session_id=...`. The Billing page calls the **sync-checkout-session** Edge Function with that session ID, which fetches the session from Stripe and upserts the subscription row. So either the webhook or the first load of Billing will update your subscription—you're not relying on the webhook alone. Deploy it once: `supabase functions deploy sync-checkout-session` (no `--no-verify-jwt`; it uses the user's JWT).

If the **webhook** is wrong, checkout can still work and redirect to Stripe; the problem will be that after payment your app never gets the event, so the subscription row isn’t created and the user stays on the pricing page.  
If you get **401 on create-checkout-session**, that’s separate: fix Vercel env (Supabase URL + anon key) and sign in again (see CHECKOUT_401_FIX.md).
