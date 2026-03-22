-- Friends & family discount: optional % on patients (who is eligible); flag on visits; invoice snapshot for PDFs.
-- Per-treatment catalogue columns are not used — see move-friends-family-to-patients.sql if migrating from an older DB.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS friends_family_discount_percent DECIMAL(5, 2) NULL;

ALTER TABLE treatment_entries
  ADD COLUMN IF NOT EXISTS friends_family_discount_applied BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE treatment_entries
  ADD COLUMN IF NOT EXISTS friends_family_discount_percent DECIMAL(5, 2) NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS friends_family_discount_applied BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS friends_family_discount_percent DECIMAL(5, 2) NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS friends_family_standard_price DECIMAL(10, 2) NULL;
