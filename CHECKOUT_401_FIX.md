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

## Summary

- **401** = Supabase rejected the request: wrong/missing **VITE_SUPABASE_URL** or **VITE_SUPABASE_ANON_KEY** on Vercel, or not signed in / expired session.
- Fix: set both env vars in Vercel to the **xfkitnutpzhaamuaaelp** project, set Root Directory if needed, redeploy, then sign in and try checkout again.
