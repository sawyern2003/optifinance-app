# Payment Reminders Setup Guide

This guide explains how to set up automatic payment reminders and follow-up scheduling.

## Features

1. **Initial Payment Reminders**: Send SMS reminders when invoices are created
2. **Follow-up Reminders**: Automatically send follow-up reminders at intervals:
   - First follow-up: 7 days after initial reminder
   - Second follow-up: 14 days after initial reminder
   - Third follow-up: 30 days after initial reminder
3. **Invoice PDF Generation**: Generate and send invoice PDFs via SMS/email

## Setup Steps

### 1. Deploy Edge Functions

Deploy the payment reminder functions to Supabase:

```bash
supabase functions deploy send-payment-reminder
supabase functions deploy generate-invoice-pdf
supabase functions deploy send-invoice
supabase functions deploy check-and-send-followups
```

### 2. Set Up Twilio

1. **Create Twilio Account**: Go to [twilio.com](https://twilio.com) and sign up
2. **Get Credentials**:
   - Go to Twilio Console → Account → API Keys & Tokens
   - Copy your Account SID
   - Copy your Auth Token
   - Go to Phone Numbers → Manage → Active Numbers
   - Copy your Twilio phone number
3. **Set Secrets in Supabase**:
   ```bash
   supabase secrets set TWILIO_ACCOUNT_SID=your_account_sid
   supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token
   supabase secrets set TWILIO_PHONE_NUMBER=+1234567890
   ```

### 3. Set Up Follow-up Reminder Scheduling

The `check-and-send-followups` function needs to be called periodically (recommended: daily).

#### Option A: Using External Cron Service (Recommended)

Use a service like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com):

1. Create a cron job that runs daily (e.g., at 9 AM)
2. Set the URL to call your Edge Function:
   ```
   https://your-project-ref.supabase.co/functions/v1/check-and-send-followups
   ```
3. Set HTTP method to `POST`
4. Add headers:
   - `Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY`
   - `Content-Type: application/json`
5. Body: `{}`

#### Option B: Using Supabase pg_cron (Advanced)

If you have pg_cron enabled in Supabase:

1. Go to Supabase Dashboard → SQL Editor
2. Run this SQL to create a scheduled job:
   ```sql
   SELECT cron.schedule(
     'send-payment-followups',
     '0 9 * * *', -- Runs daily at 9 AM UTC
     $$
     SELECT net.http_post(
       url := 'https://your-project-ref.supabase.co/functions/v1/check-and-send-followups',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY'
       ),
       body := '{}'::jsonb
     ) AS request_id;
     $$
   );
   ```

Note: pg_cron requires the extension to be enabled in your Supabase project.

### 4. Update Database Schema

Make sure you've run the updated `database/schema.sql` which includes the `payment_reminders` table.

### 5. Configure Bank Details

In the app, go to **Settings** and add your bank details:
- Bank Name
- Account Number
- Sort Code

These details will be included in payment reminder SMS messages.

## How It Works

### Initial Reminders

When you click "Send Payment Reminder" on an invoice:
1. The system sends an SMS to the patient with:
   - Thank you message
   - Invoice amount
   - Bank details for payment
2. A record is created in `payment_reminders` table

### Follow-up Reminders

The `check-and-send-followups` function:
1. Finds all invoices with status "sent" or "overdue" (not "paid")
2. Checks when the last reminder was sent
3. Sends follow-up reminders based on intervals:
   - 7 days after initial reminder
   - 14 days after initial reminder
   - 30 days after initial reminder
4. Updates invoice status to "overdue" after 14 days
5. Stops sending after 3 follow-ups

### Invoice PDFs

- Click "Send Invoice" to generate PDF and send via SMS/email
- PDFs are stored in Supabase Storage
- Links are included in SMS/email messages

## Testing

1. **Test Initial Reminder**:
   - Create an invoice
   - Click "Send Payment Reminder"
   - Check that SMS is received

2. **Test Follow-ups**:
   - Create an invoice and send initial reminder
   - Manually call the follow-up function or wait for scheduled run
   - Verify follow-ups are sent at correct intervals

3. **Test Invoice PDF**:
   - Click "Send Invoice" on an invoice
   - Verify PDF is generated and link is sent

## Troubleshooting

- **SMS not sending**: Check Twilio credentials and account balance
- **Follow-ups not running**: Verify cron job is set up correctly
- **PDFs not generating**: Check Supabase Storage bucket "files" exists and is configured
- **Bank details missing**: Ensure bank details are added in Settings
