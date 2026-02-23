-- Run after schema.sql if your Catalogue sends typical_product_cost / duration_minutes.
-- Adds the column the UI uses and ensures default_duration_minutes is used.

ALTER TABLE treatment_catalog ADD COLUMN IF NOT EXISTS typical_product_cost DECIMAL(10, 2);
