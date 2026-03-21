-- Add optional business address to profiles (for invoice PDFs)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_address TEXT;
