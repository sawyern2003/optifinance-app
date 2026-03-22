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
| **`INVOICE_SEND_DOMAIN`** | **`mail.optimedix.ai`** (verify this **whole subdomain** once in SendGrid) |
| `FROM_EMAIL` | Optional legacy; not used for From when `INVOICE_SEND_DOMAIN` is set |

With **`INVOICE_SEND_DOMAIN`**, each clinic automatically gets **`{slug}-{id}@mail.optimedix.ai`** — no per-clinic DNS. Patients see **clinician + clinic name**; **Reply-to** uses Settings.

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
