-- Safe schema that drops policies before creating them (prevents duplicate errors)
-- Run this if you get "already exists" errors

-- Drop existing policies (ignore errors if they don't exist)
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can manage own patients" ON patients;
    DROP POLICY IF EXISTS "Users can manage own practitioners" ON practitioners;
    DROP POLICY IF EXISTS "Users can manage own treatment_catalog" ON treatment_catalog;
    DROP POLICY IF EXISTS "Users can manage own treatment_entries" ON treatment_entries;
    DROP POLICY IF EXISTS "Users can manage own expenses" ON expenses;
    DROP POLICY IF EXISTS "Users can manage own invoices" ON invoices;
    DROP POLICY IF EXISTS "Users can manage own export_history" ON export_history;
    DROP POLICY IF EXISTS "Users can manage own competitor_pricing" ON competitor_pricing;
    DROP POLICY IF EXISTS "Users can manage own tax_settings" ON tax_settings;
    DROP POLICY IF EXISTS "Users can manage own chat_history" ON chat_history;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Now run the rest of the original schema.sql starting from the policies section
-- (You can copy from line 175 onwards from schema.sql)
