# Deployment Guide

This guide walks you through deploying OptiFinance to production and setting up subscriptions.

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

3. **Configure Authentication**:
   - Go to Authentication → URL Configuration
   - Set Site URL to your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
   - Add Redirect URLs:
     - `https://your-app.vercel.app/auth`
     - `https://your-app.vercel.app/Billing`
     - `https://your-app.vercel.app/Checkout`

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
   ```

5. **Deploy Functions**:
   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy stripe-webhook
   supabase functions deploy create-billing-portal-session
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

## Support

For issues, check:
- Supabase logs: Dashboard → Logs → Edge Functions
- Vercel logs: Dashboard → Deployments → View logs
- Stripe logs: Dashboard → Developers → Events
