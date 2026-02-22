# Checkout not working – step-by-step check

You’ve set the variables and deployed the Edge Functions, but checkout still fails. Use this list **in order** so we can see exactly where it breaks.

---

## Step 1: Confirm what the live app is using

The live site only sees env vars that were set **before** the last deploy. If you added or changed vars after that, the build is still using the old values.

1. Open **https://optifinance-app.vercel.app**
2. Open DevTools (F12) → **Network** tab (leave it open)
3. **Sign in** or click around so the app sends requests to Supabase
4. In the list, click any request whose URL contains **supabase.co**
5. Check the **Request URL**. It must contain:
   **xfkitnutpzhaamuaaelp.supabase.co**

If the URL uses a **different** project ID or **placeholder**, the live build doesn’t have the right env vars. Go to Step 2.

---

## Step 2: Set Vercel env and redeploy (no guessing)

1. **Supabase**  
   [Dashboard → Project xfkitnutpzhaamuaaelp → Settings → API](https://supabase.com/dashboard/project/xfkitnutpzhaamuaaelp/settings/api)  
   Copy:
   - **Project URL** (e.g. `https://xfkitnutpzhaamuaaelp.supabase.co`)
   - **anon public** (long string under Project API keys)

2. **Vercel**  
   [Vercel → your project → Settings → Environment Variables](https://vercel.com)  
   Add or **edit** (overwrite) for **Production** (and Preview if you use it):
   - **VITE_SUPABASE_URL** = Project URL, no trailing slash
   - **VITE_SUPABASE_ANON_KEY** = anon public key  
   Save.

3. **Redeploy**  
   Vercel → **Deployments** → ⋮ on latest → **Redeploy**.  
   Wait until the new deployment is **Ready**.

4. **Clear browser**  
   On https://optifinance-app.vercel.app clear site data (or use an incognito window).

5. **Sign in again** on the live app, then try checkout.

If it still fails, go to Step 3.

---

## Step 3: See the real error from the Edge Function

The 401 or “non-2xx” message is generic. The **function logs** show the actual error.

1. Open **[Supabase → Logs → Edge Functions](https://supabase.com/dashboard/project/xfkitnutpzhaamuaaelp/logs/edge-functions)**
2. Select **create-checkout-session** in the dropdown
3. Leave the tab open, then on the **live app** try **Checkout** again (signed in)
4. In the logs, look at the **newest** entry for create-checkout-session

You might see:
- **No new log** → Request never reached the function. Usually wrong Supabase URL/anon key or missing/invalid session (back to Step 2 and Network check in Step 1).
- **Error in log** (e.g. “No authorization header”, “Stripe …”, “Price ID …”) → That message is the real cause; fix that (e.g. Stripe key, Price ID, or auth).

Note the **exact** error message and use it for the next step.

---

## Step 4: Supabase secrets (for create-checkout-session)

The function runs on Supabase and needs these **secrets** (not Vercel):

In terminal:

```bash
cd "/Users/nicholassawyer/Desktop/optifinance latest/optifinance-app"
supabase secrets list
```

Check that you have at least:

- **STRIPE_SECRET_KEY** (sk_…)
- **SITE_URL** (e.g. https://optifinance-app.vercel.app)

If either is missing:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_your_key
supabase secrets set SITE_URL=https://optifinance-app.vercel.app
```

Then:

```bash
supabase functions deploy create-checkout-session
```

Try checkout again and check the logs (Step 3) for any new error.

---

## Step 5: One more auth check

401 often means “no valid session” for this project.

1. On the **live** app, **Sign out**
2. **Sign in again** (same email/password)
3. Go straight to **Pricing** → choose plan → **Checkout**

In **Network** tab, click the **create-checkout-session** request and check **Request Headers**. You should see:

**Authorization: Bearer eyJ...**

If **Authorization** is missing or empty, the app is not sending a session. That usually means the app is still using the wrong Supabase project (wrong **VITE_SUPABASE_URL** / **VITE_SUPABASE_ANON_KEY**) or the build wasn’t redeployed after changing them. Redo Step 2 and redeploy.

---

## Summary

| Step | What you’re checking |
|------|----------------------|
| 1 | Live app really calls **xfkitnutpzhaamuaaelp.supabase.co** (Network tab) |
| 2 | Vercel has **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** for that project, then **Redeploy** |
| 3 | **Supabase Logs → create-checkout-session** for the **exact** error when you hit Checkout |
| 4 | **supabase secrets list** has **STRIPE_SECRET_KEY** and **SITE_URL**; deploy **create-checkout-session** |
| 5 | **Authorization: Bearer …** present on create-checkout-session request after signing in again |

Most checkout issues are either (A) live app using wrong Supabase project or old build, or (B) a clear error in the Edge Function logs (Stripe, Price ID, or auth). Steps 1–3 and 5 narrow it down; Step 4 fixes the function config.
