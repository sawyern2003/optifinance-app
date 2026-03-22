-- Discount % for this specific visit (invoice PDF). Optional; used when friends_family_discount_applied is true.
ALTER TABLE treatment_entries
  ADD COLUMN IF NOT EXISTS friends_family_discount_percent DECIMAL(5, 2) NULL;
