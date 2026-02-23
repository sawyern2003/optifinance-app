# Fix "Checkout failed" / 401 on create-checkout-session

If you see **"Checkout failed"** and **"Edge Function returned a non-2xx status code"** or **401** in the console, the browser is calling Supabase but the request is rejected. Do these in order.

---

## 1. Use the correct Supabase project on Vercel

Your Edge Functions are on project **xfkitnutpzhaamuaaelp**. The **live app** must use that same project.

1. Go to **[Supabase Dashboard → your project → Settings → API](https://supabase.com/dashboard/project/xfkitnutpzhaamuaaelp/settings/api)**.
2. Copy:
   - **Project URL** (e.g. `https://xfkitnutpzhaamuaaelp.supabase.co`)
   - **anon public** key (under "Project API keys").
3. Go to **[Vercel](https://vercel.com) → your project → Settings → Environment Variables**.
4. Set (or update):
   - **VITE_SUPABASE_URL** = the Project URL (no trailing slash).
   - **VITE_SUPABASE_ANON_KEY** = the anon public key.
5. **Redeploy**: Deployments → ⋮ on latest deployment → **Redeploy**.

If these were wrong or missing, the app was talking to the wrong project (or placeholder), which causes 401.

---

## 2. Build from the right folder on Vercel

If your GitHub repo has the app inside a folder (e.g. `optifinance-app`):

1. Vercel → your project → **Settings → General**.
2. **Root Directory**: set to `optifinance-app` (or the folder that contains `package.json` and `src/`).
3. Save and **Redeploy**.

Otherwise Vercel may build the wrong thing and env vars may not apply to the built app.

---

## 3. Be signed in when you checkout

The checkout Edge Function needs your session (JWT). If you’re not signed in or the session expired, you get 401.

1. On **https://optifinance-app.vercel.app**, click **Sign out** (if you’re logged in).
2. **Sign in** again.
3. Go to **Pricing** → choose a plan → **Checkout**.

Use a normal (non-incognito) window so the session is stored.

---

## 4. Check Supabase function logs (optional)

1. Go to **[Supabase Dashboard → Logs → Edge Functions](https://supabase.com/dashboard/project/xfkitnutpzhaamuaaelp/logs/edge-functions)**.
2. Select **create-checkout-session**.
3. Try checkout again and see if any log line appears. If you see **nothing**, the 401 is from the gateway (wrong/missing anon key or JWT) — go back to step 1. If you see an **error** inside the function, that message tells you what to fix (e.g. missing Stripe key).

---

## 5. Workaround: deploy with `--no-verify-jwt` (gateway still returns 401)

If the URL, anon key, and JWT issuer (`iss`) are all correct but you still get **401** and **no log** for `create-checkout-session`, the gateway’s JWT check may be failing (e.g. algorithm, expiry, or key quirk). You can bypass the gateway check and still enforce auth inside the function:

1. From your app repo (e.g. `optifinance-app`), deploy the function with JWT verification disabled at the gateway:
   ```bash
   supabase functions deploy create-checkout-session --no-verify-jwt
   ```
2. The function **still** validates the user: it reads the `Authorization` header and calls `supabase.auth.getUser()`, so unauthenticated or invalid tokens are rejected with "User not authenticated". Only the gateway no longer does its own JWT check.
3. Try checkout again from the live app (signed in). If the token is expired, sign out and sign in to get a fresh one.

---

## 6. "Not a valid url" from Stripe

Stripe validates the **success_url** and **cancel_url** it receives. Those are built from the **SITE_URL** secret in your Edge Function. If SITE_URL is missing or invalid, Stripe returns an error like "not a valid url".

**Fix:** set SITE_URL to your live app URL (no trailing slash), then redeploy the function so it picks up the secret:

1. **Supabase Dashboard:** [Project Settings → Edge Functions → Secrets](https://supabase.com/dashboard/project/xfkitnutpzhaamuaaelp/settings/functions). Add or edit:
   - **SITE_URL** = `https://optifinance-app.vercel.app`
2. Or via CLI from your app folder:
   ```bash
   supabase secrets set SITE_URL=https://optifinance-app.vercel.app
   ```
3. Redeploy so the function sees the new secret:
   ```bash
   supabase functions deploy create-checkout-session --no-verify-jwt
   ```

Use your real Vercel URL if different (e.g. `https://your-project.vercel.app`). No trailing slash.

---

## 7. 401 / CORS on Invoices & PDF (generate-invoice-pdf, send-invoice, send-payment-reminder)

If you see **401**, **CORS**, or **"Edge Function returned a non-2xx status code"** when generating invoice PDFs, sending invoices (SMS/email), or sending payment reminders:

1. **Sign in again** – The app now refreshes your session before calling these functions; an expired session will show "Session expired. Please sign in again."
2. **Vercel env** – Same as step 1: **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** must be set for project **xfkitnutpzhaamuaaelp**, then redeploy.
3. **If 401 persists** – Deploy the invoice/reminder functions with JWT verification disabled at the gateway (auth is still enforced inside each function):
   ```bash
   cd optifinance-app  # or your app root
   supabase functions deploy generate-invoice-pdf --no-verify-jwt
   supabase functions deploy send-invoice --no-verify-jwt
   supabase functions deploy send-payment-reminder --no-verify-jwt
   ```

---

## Summary

- **401** = Supabase rejected the request: wrong/missing **VITE_SUPABASE_URL** or **VITE_SUPABASE_ANON_KEY** on Vercel, or not signed in / expired session.
- If everything is correct and you still get 401 with no function log, deploy with **`--no-verify-jwt`** (see step 5 for checkout; step 7 for invoice/PDF/reminder); the functions still enforce auth.
- Fix: set both env vars in Vercel to the **xfkitnutpzhaamuaaelp** project, set Root Directory if needed, redeploy, then sign in and try again.
