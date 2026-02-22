# Deployment Guide

This guide walks you through deploying OptiFinance to production and setting up subscriptions.

**→ Want to see where you’re at and what’s left?** Use **SETUP_CHECKLIST.md** and tick each item as you verify it.

## Running without localhost (production-only)

To have a **fully functioning app with working auth** (no localhost):

1. **Deploy the frontend** (Step 1 below) so the app is served from a real URL (e.g. `https://your-app.vercel.app`).
2. **Configure Supabase Auth for that URL** (Step 2, “Configure Authentication”):
   - **Site URL**: set to your live app URL (e.g. `https://your-app.vercel.app`).
   - **Redirect URLs**: add every path where Supabase might send users (login, email confirm, checkout, etc.). See the list in Step 2.
3. **Set env vars** on Vercel (same Supabase URL and anon key as in your Supabase project).
4. **Redeploy** after changing env vars so the build uses them.

Once the Site URL and Redirect URLs in Supabase point at your deployed URL (not localhost), auth will work in production. You can remove or leave localhost in Redirect URLs; the “localhost” auth error goes away when you use the app at your production URL.

## Prerequisites

1. Vercel account (free tier works)
2. Supabase account (free tier works)
3. Stripe account (required for payments)

## Step 1: Deploy to Vercel

1. **Install Vercel CLI** (optional, or use web interface):
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   cd optifinance-app
   vercel
   ```

   Or connect your GitHub repo to Vercel dashboard and deploy from there.

3. **Set Environment Variables in Vercel**:
   - Go to your project settings → Environment Variables
   - Add:
     - `VITE_SUPABASE_URL` - Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
     - `VITE_STRIPE_PUBLISHABLE_KEY` - Your Stripe publishable key (starts with `pk_`)
     - `VITE_STRIPE_PRICE_ID_MONTHLY` - Stripe Price ID for monthly plan (optional)
     - `VITE_STRIPE_PRICE_ID_ANNUAL` - Stripe Price ID for annual plan (optional)

4. **Redeploy** after adding environment variables

## Step 2: Configure Supabase Production

1. **Create Production Project** (or use existing):
   - Go to supabase.com
   - Create new project or use existing
   - Note your project URL and anon key

2. **Run Database Schema**:
   - Go to SQL Editor in Supabase dashboard
   - Copy and paste contents of `database/schema.sql`
   - Run the SQL script

3. **Configure Authentication** (required for auth to work in production):
   - Go to **Authentication → URL Configuration** in the Supabase dashboard.
   - **Site URL**: set to your live app URL (e.g. `https://your-app.vercel.app`). This is the default redirect after login/confirm; if it stays as `http://localhost:5173` you will see redirect/auth errors when using the deployed app.
   - **Redirect URLs**: add one line per URL (including trailing slash variants if you use them):
     - `https://your-app.vercel.app`
     - `https://your-app.vercel.app/`
     - `https://your-app.vercel.app/Auth`
     - `https://your-app.vercel.app/auth`
     - `https://your-app.vercel.app/Billing`
     - `https://your-app.vercel.app/Checkout`
     - `https://your-app.vercel.app/SubscriptionPricing`
   - Optional: add `http://localhost:5173` and `http://localhost:5173/` if you still want to test auth locally.

4. **Set Up Storage Bucket**:
   - Go to Storage
   - Create bucket named `files`
   - Make it public (or configure policies)

## Step 3: Set Up Stripe

1. **Create Stripe Account**:
   - Go to stripe.com and sign up
   - Complete account setup

2. **Get API Keys**:
   - Go to Developers → API keys
   - Copy:
     - Publishable key (starts with `pk_`)
     - Secret key (starts with `sk_`) - Keep this secret!

3. **Create Products and Prices**:
   - Go to Products in Stripe dashboard
   - Create product: "OptiFinance Monthly"
     - Add price: £29/month, recurring monthly
     - Copy the Price ID (starts with `price_`)
   - Create product: "OptiFinance Annual" (optional)
     - Add price: £290/year, recurring yearly
     - Copy the Price ID

4. **Set Up Webhook**:
   - Go to Developers → Webhooks
   - Click "Add endpoint"
   - Endpoint URL: `https://your-project.supabase.co/functions/v1/stripe-webhook`
   - Select events to listen to:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Copy the webhook signing secret (starts with `whsec_`)

## Step 4: Deploy Supabase Edge Functions

1. **Install Supabase CLI**:
   ```bash
   npm install -g supabase
   ```

2. **Login**:
   ```bash
   supabase login
   ```

3. **Link Project**:
   ```bash
   cd optifinance-app
   supabase link --project-ref your-project-ref
   ```

4. **Set Secrets**:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_your_secret_key
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   supabase secrets set SITE_URL=https://your-app.vercel.app
   supabase secrets set OPENAI_API_KEY=sk-your_openai_key
   supabase secrets set TWILIO_ACCOUNT_SID=your_twilio_sid
   supabase secrets set TWILIO_AUTH_TOKEN=your_twilio_token
   supabase secrets set TWILIO_PHONE_NUMBER=+44xxxxxxxxxx
   ```

5. **Deploy Functions**:
   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy stripe-webhook
   supabase functions deploy create-billing-portal-session
   supabase functions deploy openai-consultant
   supabase functions deploy generate-invoice-pdf
   supabase functions deploy send-invoice
   supabase functions deploy send-payment-reminder
   ```

## Step 5: Update Environment Variables

### In Vercel:
- `VITE_STRIPE_PRICE_ID_MONTHLY` - Your monthly Stripe Price ID
- `VITE_STRIPE_PRICE_ID_ANNUAL` - Your annual Stripe Price ID (optional)

### In Supabase (Edge Functions):
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook secret
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `SITE_URL` - Your production URL
- `OPENAI_API_KEY` - Your OpenAI API key (for AI Consultant chat; deploy `openai-consultant` and set this secret)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` - For invoice and payment-reminder SMS (see **INVOICES_SMS_TWILIO.md**)
- `RESEND_API_KEY` - For sending invoices by email (optional; get at resend.com). Optional: `FROM_EMAIL` (e.g. `invoices@yourdomain.com`) or leave unset to use Resend’s onboarding domain

## Step 6: Test the Deployment

1. **Test Signup Flow**:
   - Visit your deployed app
   - Sign up for an account
   - You should be redirected to subscription pricing

2. **Test Subscription**:
   - Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any CVC
   - Complete checkout

3. **Verify Webhook**:
   - Check Supabase dashboard → Database → subscriptions table
   - Should see subscription record created
   - Check Stripe dashboard → Developers → Webhooks → Recent events

4. **Test Billing Portal**:
   - Go to Billing page
   - Click "Manage Billing in Stripe"
   - Should open Stripe billing portal

## Step 7: Go Live

1. **Switch Stripe to Live Mode**:
   - In Stripe dashboard, toggle from Test mode to Live mode
   - Get new API keys (live keys)
   - Update environment variables in Vercel and Supabase

2. **Update Webhook**:
   - Create new webhook endpoint in Stripe (live mode)
   - Update webhook secret in Supabase

3. **Final Testing**:
   - Test with real payment method (small amount)
   - Verify subscription creation
   - Verify webhook processing

## Custom Domain (Optional)

1. **In Vercel**:
   - Go to Project Settings → Domains
   - Add your custom domain
   - Follow DNS configuration instructions

2. **Update Supabase**:
   - Update Site URL in Authentication settings
   - Update Redirect URLs
   - Update `SITE_URL` in Supabase Edge Functions secrets

3. **Update Stripe**:
   - Update webhook endpoint URL if using custom domain

## Troubleshooting

### Auth error when using the app (e.g. "redirect" or "invalid redirect" / still on localhost)
- Supabase Auth uses **Site URL** and **Redirect URLs** from your project. If you're using the **deployed** app (e.g. on Vercel), set:
  - **Site URL** = your production URL (e.g. `https://your-app.vercel.app`)
  - **Redirect URLs** = include that same base URL and all paths where users land after login/email confirm (e.g. `/`, `/Auth`, `/Billing`, `/Checkout`, `/SubscriptionPricing`).
- If Site URL is still `http://localhost:5173`, Supabase will try to send users back to localhost after login/confirm, which causes errors when you're actually on the live site. Switch to the production URL to run without localhost.

### Subscription not creating after payment
- Check Stripe webhook logs
- Verify webhook secret is correct
- Check Supabase Edge Function logs
- Verify database schema includes subscriptions table

### Checkout redirects failing
- Verify redirect URLs in Supabase Authentication settings
- Check `SITE_URL` environment variable in Edge Functions

### Webhook errors
- Verify webhook secret matches
- Check Stripe webhook endpoint URL is correct
- Review Edge Function logs in Supabase dashboard

### "Checkout failed" / "Failed to send a request to the Edge Function"
- **Deploy the Edge Function**: The checkout flow calls the `create-checkout-session` Supabase Edge Function. It must be deployed:
  ```bash
  cd optifinance-app
  supabase link --project-ref YOUR_PROJECT_REF
  supabase functions deploy create-checkout-session
  ```
- **Set Edge Function secrets** in Supabase (Dashboard → Project Settings → Edge Functions → Secrets, or via CLI):
  - `STRIPE_SECRET_KEY` – your Stripe secret key (starts with `sk_`)
  - `SITE_URL` – your app URL (e.g. `https://your-app.vercel.app` or `http://localhost:5173` for local)
- **Confirm env in frontend**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must point to the same Supabase project where the function is deployed.
- **User must be signed in**: The function requires the `Authorization` header; the Supabase client sends this only when the user has an active session.

## Support

For issues, check:
- Supabase logs: Dashboard → Logs → Edge Functions
- Vercel logs: Dashboard → Deployments → View logs
- Stripe logs: Dashboard → Developers → Events
