-- Friends & family discount is per patient (not per treatment).
-- Run after add-friends-family-discount.sql if you already added the old catalogue column.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS friends_family_discount_percent DECIMAL(5, 2) NULL;

-- Remove legacy per-treatment column (safe if column never existed)
ALTER TABLE treatment_catalog
  DROP COLUMN IF EXISTS friends_family_discount_percent;
