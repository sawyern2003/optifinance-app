-- Add optional logo URL to profiles (for invoice PDF header)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;
