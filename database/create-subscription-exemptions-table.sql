-- Run this in Supabase Dashboard → SQL Editor → New query
-- Allows specific accounts to use the app for free (no Stripe subscription).
-- Add a user by inserting their user_id (from Auth → Users in Supabase).

CREATE TABLE IF NOT EXISTS subscription_exemptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE subscription_exemptions ENABLE ROW LEVEL SECURITY;

-- Users can only see if they themselves are exempt (so the app can check "am I exempt?").
-- Only you (via Dashboard or SQL) can INSERT/DELETE to add/remove free accounts.
DROP POLICY IF EXISTS "Users can read own exemption" ON subscription_exemptions;
CREATE POLICY "Users can read own exemption" ON subscription_exemptions
  FOR SELECT USING (auth.uid() = user_id);

-- To add a free account after running this script:
-- 1. In Supabase go to Authentication → Users and copy the user's UUID.
-- 2. In SQL Editor run: INSERT INTO subscription_exemptions (user_id) VALUES ('paste-uuid-here');
-- To remove: DELETE FROM subscription_exemptions WHERE user_id = 'uuid';
