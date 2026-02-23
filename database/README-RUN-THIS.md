# Why catalogue data isn’t saving

If you can’t add treatments, patients, or practitioners and nothing appears in the catalogue, the app is almost certainly talking to a Supabase project where **the main tables don’t exist yet**.

The app needs these tables (and their RLS policies and triggers) in your **same** Supabase project (the one in your app’s `VITE_SUPABASE_URL`):

- `patients`
- `practitioners`
- `treatment_catalog`
- `treatment_entries`
- `expenses`
- `invoices`
- and the rest in `schema.sql`

If you only ran the subscription-related SQL, the catalogue tables were never created, so inserts do nothing or fail silently.

---

## Fix: run the full schema once

1. Open **Supabase Dashboard** → your project → **SQL Editor** → **New query**.
2. Open **`database/schema-full-rerun.sql`** in your repo and copy its **entire** contents into the SQL Editor.
3. Run the script.

That creates all tables, RLS policies, and triggers (including the one that sets `user_id` on insert so your data is tied to your account).

If you get errors like **“policy already exists”** or **“trigger already exists”**, some parts were already applied. You can:

- Run **`database/schema-safe-rerun.sql`** instead (same schema but with `DROP POLICY IF EXISTS` / `DROP TRIGGER IF EXISTS` so it’s safe to run again), or  
- Ignore the errors for the objects that already exist and ensure the rest ran.

After the schema has been applied, try adding a treatment or patient again.

If you already ran an older version of the schema that didn’t have `typical_product_cost` on `treatment_catalog`, run **`database/add-treatment-catalog-column.sql`** once as well.

If something still fails, the app will show an error toast with the real message (e.g. permission denied, column missing).

---

## Check that tables exist

In Supabase: **Table Editor**. You should see tables such as **patients**, **practitioners**, **treatment_catalog**. If those are missing, run the schema as above.
