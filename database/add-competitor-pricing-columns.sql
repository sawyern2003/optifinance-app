-- Add missing columns to competitor_pricing table for AI extraction feature
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/xfkitnutpzhaamuaaelp/sql

ALTER TABLE competitor_pricing
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS treatment_category TEXT;

-- Add helpful comment
COMMENT ON COLUMN competitor_pricing.location IS 'Geographic location of competitor (city, region)';
COMMENT ON COLUMN competitor_pricing.treatment_category IS 'Treatment category (Injectables, Skin, Laser, etc.)';
