# Invoice email via SendGrid (Twilio SendGrid)

Use this when **Resend** is unavailable or you prefer SendGrid.

## 1. SendGrid account

1. Go to [sendgrid.com](https://sendgrid.com) (also available via Twilio as **Twilio SendGrid**).
2. Create an API key with **Mail Send** permission.
3. **Settings → Sender Authentication**: verify a **Single Sender** or **Domain** for `optimedix.ai` (or your domain). The address in **`FROM_EMAIL`** must use that verified domain.

## 2. Supabase secrets

In **Project Settings → Edge Functions → Secrets**:

| Secret | Example |
|--------|---------|
| `SENDGRID_API_KEY` | `SG.xxx...` |
| **`INVOICE_SEND_DOMAIN`** | **`mail.optimedix.ai`** (see **Sender verification** below) |
| **`SENDGRID_VERIFIED_FROM_EMAIL`** | **Recommended until domain auth is done:** e.g. `invoices@optimedix.ai` — must be a **verified Single Sender** or on a **domain-authenticated** zone in SendGrid. When set, SendGrid uses this as **From**; patients still see the clinician name and **Reply-to** goes to Settings / your account email. |
| `FROM_EMAIL` | Optional legacy; not used for From when `INVOICE_SEND_DOMAIN` is set |

With **`INVOICE_SEND_DOMAIN`**, each clinic gets a logical address **`{slug}-{id}@mail.optimedix.ai`** for display/tracking. **SendGrid still requires that address to be allowed:**

1. **Best long-term:** In SendGrid → **Settings → Sender Authentication** → **Authenticate Your Domain** for **`mail.optimedix.ai`** (exact subdomain). Then arbitrary local parts on that domain are valid **From** addresses.
2. **Fast fix:** Create a **Single Sender** (e.g. `invoices@yourdomain.com`), verify it in SendGrid, and set **`SENDGRID_VERIFIED_FROM_EMAIL`** to that address in Supabase secrets. All invoice mail will **From** that address until you complete domain auth and remove the secret.

If **`INVOICE_SEND_DOMAIN`** is **not** set, clinics must fill **Custom send-from** in Settings (their own verified address).

If **`SENDGRID_API_KEY`** is set, **`send-invoice`** uses SendGrid (over Resend when both exist).

## 3. Deploy

```bash
supabase functions deploy send-invoice
```

## 4. Test

**Communications** → **Email PDF** on an invoice whose patient contact is an email.

## Notes

- Same **per-clinic** behaviour as Resend: **Clinic name** + **`FROM_EMAIL`**, optional **Settings → Invoice emails** overrides.
- **SMS** is unchanged (still **Twilio** on the messaging side).
