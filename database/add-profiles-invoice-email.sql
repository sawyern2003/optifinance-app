-- Per-clinic invoice email identity (multi-tenant)
-- invoice_from_email: optional; if set, Resend sends From this address (domain must be verified in your Resend project).
-- invoice_reply_to_email: optional; patients' replies go here (any inbox works). Falls back to account email if empty.
-- invoice_sender_name: optional; inbox display name e.g. "Dr Jane Smith" (defaults to clinic name).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invoice_from_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invoice_reply_to_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invoice_sender_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invoice_send_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_invoice_send_slug_unique
  ON profiles (invoice_send_slug)
  WHERE invoice_send_slug IS NOT NULL AND invoice_send_slug <> '';
