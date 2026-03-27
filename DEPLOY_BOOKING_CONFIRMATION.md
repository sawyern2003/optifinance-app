# Deploy Booking Confirmation Edge Function

## Quick Deploy

Since you already have Twilio and SendGrid configured, you just need to deploy the new edge function.

### Option 1: Deploy via Supabase CLI (Recommended)

```bash
# Navigate to project
cd "/Users/nicholassawyer/Desktop/optifinance latest/optifinance-app"

# Deploy the function
npx supabase functions deploy send-booking-confirmation
```

### Option 2: Deploy via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Click **Edge Functions** (left sidebar)
3. Click **Deploy New Function**
4. Copy the entire contents of `supabase/functions/send-booking-confirmation/index.ts`
5. Paste into the editor
6. Name it: `send-booking-confirmation`
7. Click **Deploy**

---

## Verify It Works

After deploying:

1. **Make a test booking** on your booking page
2. **Check browser console** - you should see:
   ```
   ✅ Confirmation sent: {...}
   📧 Email sent to: patient@example.com
   📱 SMS sent to: +44XXXXXXXXXX
   ```
3. **Check patient email** - they should receive confirmation
4. **Check patient SMS** - they should receive text

---

## Environment Variables

The function uses your **existing** Supabase secrets:

### Already Configured ✅
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `SENDGRID_API_KEY` (or `RESEND_API_KEY`)
- `INVOICE_SEND_DOMAIN` (optional)

### No new secrets needed!

The function reuses your invoice email configuration, so emails will come from the same address as your invoices.

---

## What Gets Sent

### Email Example
```
Subject: Appointment Confirmed - Your Clinic Name

Dear John Smith,

Your appointment at ABC Clinic has been confirmed.

┌────────────────────────────┐
│ Treatment: Botox            │
│ Date: Monday, 1 April 2024  │
│ Time: 14:00                 │
└────────────────────────────┘

If you need to reschedule or cancel, please contact us.

Best regards,
Dr. Smith
ABC Clinic
```

### SMS Example
```
Hi John Smith, your appointment at ABC Clinic is confirmed for Monday, 1 April 2024 at 14:00 for Botox. See you then!
```

---

## Troubleshooting

### "Function not found"
- Make sure you deployed it (see steps above)
- Function name must be exactly `send-booking-confirmation`

### "SENDGRID_API_KEY not found"
- You said you already have this configured
- Check Supabase Dashboard → Project Settings → Edge Functions → Secrets
- Make sure `SENDGRID_API_KEY` or `RESEND_API_KEY` exists

### "Email sent" but patient didn't receive
- Check spam folder
- Check SendGrid dashboard for delivery status
- Verify email address is correct

### "SMS sent" but patient didn't receive
- Check Twilio dashboard for message status
- Verify phone number format (+44...)
- Check Twilio balance

---

## Testing Checklist

- [ ] Deploy edge function to Supabase
- [ ] Make test booking with your own email
- [ ] Check you receive email
- [ ] Make test booking with your own phone
- [ ] Check you receive SMS
- [ ] Verify console shows "✅ Confirmation sent"
- [ ] Check Supabase Functions logs for errors

---

## Next: Fix Patient Matching

Once confirmations work, we still need to fix the patient matching issue.

**Remember:** The logs showed "No matching patient found" even though you had 3 patients.

Make another booking with **detailed logs** enabled and send me a screenshot so we can debug why the email/name matching isn't working!
