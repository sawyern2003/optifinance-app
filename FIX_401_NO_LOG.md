# Fix 401 – request never reaches the function (no new log)

If **no new log** appears in Supabase when you try checkout, the request is rejected at the gateway. Do these steps exactly.

---

## Step 1: Confirm Vercel env and project

1. Open **[Supabase](https://supabase.com/dashboard/project/xfkitnutpzhaamuaaelp/settings/api)** → your project → **Settings** → **API**.
2. Copy:
   - **Project URL** (e.g. `https://xfkitnutpzhaamuaaelp.supabase.co`) — no trailing slash.
   - **anon public** key (long string under "Project API keys").
3. Open **[Vercel](https://vercel.com)** → your **optifinance-app** project → **Settings** → **Environment Variables**.
4. For **Production** (and **Preview** if you use it):
   - **VITE_SUPABASE_URL** — value must be exactly the Project URL above. Edit and paste again if unsure.
   - **VITE_SUPABASE_ANON_KEY** — value must be exactly the anon public key above. Edit and paste again if unsure.
5. **Save** (no need to change anything else).

---

## Step 2: Root directory (if your repo has a subfolder)

If your GitHub repo looks like:

- `my-repo/`
  - `optifinance-app/`   ← app with `package.json` and `src/`
  - `README.md`

then Vercel must build from that folder:

1. Vercel → your project → **Settings** → **General**.
2. **Root Directory**: set to **optifinance-app** (or whatever the folder name is).
3. **Save**.

If the repo root **is** the app (only `package.json`, `src/`, etc. at top level), leave Root Directory **empty**.

---

## Step 3: Redeploy and wait

1. Vercel → **Deployments**.
2. Click **⋮** on the latest deployment → **Redeploy**.
3. Wait until status is **Ready** (do not skip this).

---

## Step 4: Clear site and sign in again

1. Open **https://optifinance-app.vercel.app**.
2. Clear data for this site only:
   - **Chrome**: DevTools (F12) → **Application** → **Storage** → **Clear site data**.
   - Or use a **new incognito/private window**.
3. **Sign in** again on the live app (same email/password as in Supabase).
4. Go to **Pricing** → choose a plan → **Checkout**.

---

## Step 5: Check what the app is sending

1. Stay on **https://optifinance-app.vercel.app**.
2. Open DevTools (F12) → **Network**.
3. Try **Checkout** again (so it fails).
4. In the list, click the request whose URL contains **create-checkout-session**.
5. Check:
   - **Request URL** must contain: **xfkitnutpzhaamuaaelp.supabase.co**.  
     If it shows a different project ID or something like **placeholder.supabase.co**, the build is still using wrong env — repeat Steps 1–3.
   - **Request Headers** must include:
     - **Authorization: Bearer eyJ...** (long token).  
       If **Authorization** is missing or empty, the app is not sending a session — sign in again (Step 4) or the anon key is still wrong.

---

## Summary

| Issue | Fix |
|-------|-----|
| Request URL not **xfkitnutpzhaamuaaelp** | Set **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** in Vercel, set **Root Directory** if needed, then **Redeploy**. |
| No **Authorization: Bearer** header | Correct env + **Redeploy**, then **Clear site data** and **Sign in again** on the live app. |

After this, try checkout once more and check **Supabase → Logs → Edge Functions → create-checkout-session** again. You should see a **new** log line when you click Checkout.
