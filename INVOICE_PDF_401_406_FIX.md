# Fix "Could not generate PDF" / 400 / 401 / 406

If you see **"Could not generate PDF"** or **"Failed to generate invoice"** with **"Edge Function returned a non-2xx status code"**, or browser errors **400** / **401** / **406** for `generate-invoice-pdf`:

---

## You don't need a separate PDF API or template

- **PDF creation** is already in the app: the **`generate-invoice-pdf`** Supabase Edge Function builds the PDF with **pdf-lib** (clinic name, patient, amount, bank details, logo, footer) and uploads it to Storage. There is no separate "PDF creation API" or "invoice template" service to add.
- **401** and **406** here mean the request is being **rejected by Supabase’s gateway** before it reaches that function (e.g. JWT check). Fix that by deploying with the flag below.

---

## Fix: deploy the function with JWT verification disabled at the gateway

Auth is still enforced **inside** the function; only the gateway check is skipped.

From your app root (e.g. `optifinance-app`), run:

```bash
# Link the project first if you haven’t (use your project ref)
# supabase link --project-ref xfkitnutpzhaamuaaelp

supabase functions deploy generate-invoice-pdf --no-verify-jwt
```

Redeploy the other invoice-related functions if you use them:

```bash
supabase functions deploy send-invoice --no-verify-jwt
supabase functions deploy send-payment-reminder --no-verify-jwt
```

Then try **Generate invoice** / **Generate PDF** again (and sign in again if your session might be expired).

---

## If you get 400: run the Storage policies (required for upload)

A **400** often means the function ran but **upload to Storage failed** because the `files` bucket has no INSERT/UPDATE policy. In **Supabase → SQL Editor**, run the contents of **`database/storage-files-invoices-policy.sql`** (it adds SELECT, INSERT, and UPDATE for the `files` bucket so the function can save PDFs and you can download them). Create the bucket **files** in Storage first if it doesn’t exist.

---

## Also check

1. **Vercel env** – **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** must point at project **xfkitnutpzhaamuaaelp** (see [CHECKOUT_401_FIX.md](./CHECKOUT_401_FIX.md)).
2. **Signed in** – Use a normal (non-incognito) window and sign in again before generating an invoice or PDF.
