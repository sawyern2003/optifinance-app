-- =====================================================
-- COMPLETE OPTIFINANCE DATABASE SETUP
-- Run this ONCE in your Supabase SQL Editor
-- =====================================================

-- =====================================================
-- PART 1: APPOINTMENTS TABLE
-- =====================================================

-- Create appointments table if it doesn't exist
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT,
  patient_email TEXT,
  patient_phone TEXT,
  treatment_name TEXT,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  duration_minutes INTEGER,
  price DECIMAL(10,2),
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  booking_source TEXT DEFAULT 'manual',
  confirmation_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security on appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to make script idempotent)
DROP POLICY IF EXISTS "Users can view their own appointments" ON appointments;
DROP POLICY IF EXISTS "Users can insert their own appointments" ON appointments;
DROP POLICY IF EXISTS "Users can update their own appointments" ON appointments;
DROP POLICY IF EXISTS "Users can delete their own appointments" ON appointments;

-- Create policies for appointments
CREATE POLICY "Users can view their own appointments"
  ON appointments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own appointments"
  ON appointments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own appointments"
  ON appointments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own appointments"
  ON appointments FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, date);

-- Create or replace function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS appointments_updated_at_trigger ON appointments;
CREATE TRIGGER appointments_updated_at_trigger
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_appointments_updated_at();

-- =====================================================
-- PART 2: TREATMENT ENTRIES - LINK TO APPOINTMENTS
-- =====================================================

-- Add appointment_id column to treatment_entries if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='treatment_entries' AND column_name='appointment_id') THEN
    ALTER TABLE treatment_entries ADD COLUMN appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_treatment_entries_appointment ON treatment_entries(appointment_id);

-- =====================================================
-- PART 3: PROFILES TABLE UPDATES FOR BOOKING
-- =====================================================

-- Add booking columns to profiles table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='profiles' AND column_name='booking_slug') THEN
    ALTER TABLE profiles ADD COLUMN booking_slug TEXT UNIQUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='profiles' AND column_name='booking_enabled') THEN
    ALTER TABLE profiles ADD COLUMN booking_enabled BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Create index for fast booking page lookups
CREATE INDEX IF NOT EXISTS idx_profiles_booking_slug ON profiles(booking_slug);

-- =====================================================
-- PART 4: AVAILABILITY SETTINGS TABLE
-- =====================================================

-- Create availability_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  working_hours JSONB DEFAULT '{
    "monday": {"start": "09:00", "end": "17:00", "enabled": true},
    "tuesday": {"start": "09:00", "end": "17:00", "enabled": true},
    "wednesday": {"start": "09:00", "end": "17:00", "enabled": true},
    "thursday": {"start": "09:00", "end": "17:00", "enabled": true},
    "friday": {"start": "09:00", "end": "17:00", "enabled": true},
    "saturday": {"start": "09:00", "end": "17:00", "enabled": false},
    "sunday": {"start": "09:00", "end": "17:00", "enabled": false}
  }'::jsonb,

  breaks JSONB DEFAULT '[]'::jsonb,
  buffer_time INTEGER DEFAULT 15,
  default_duration INTEGER DEFAULT 30,
  min_booking_notice INTEGER DEFAULT 60,
  max_booking_advance INTEGER DEFAULT 60,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security on availability_settings
ALTER TABLE availability_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own availability settings" ON availability_settings;
DROP POLICY IF EXISTS "Users can insert their own availability settings" ON availability_settings;
DROP POLICY IF EXISTS "Users can update their own availability settings" ON availability_settings;
DROP POLICY IF EXISTS "Public can view availability for booking" ON availability_settings;

-- Create policies for availability_settings
CREATE POLICY "Users can view their own availability settings"
  ON availability_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own availability settings"
  ON availability_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own availability settings"
  ON availability_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view availability for booking"
  ON availability_settings FOR SELECT
  USING (true);

-- Create or replace function to auto-update updated_at for availability_settings
CREATE OR REPLACE FUNCTION update_availability_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS availability_settings_updated_at_trigger ON availability_settings;
CREATE TRIGGER availability_settings_updated_at_trigger
BEFORE UPDATE ON availability_settings
FOR EACH ROW
EXECUTE FUNCTION update_availability_settings_updated_at();

-- =====================================================
-- PART 5: BOOKING SLUG GENERATION
-- =====================================================

-- Create or replace function to generate unique booking slug
CREATE OR REPLACE FUNCTION generate_booking_slug(clinic_name_input TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Handle null or empty input
  IF clinic_name_input IS NULL OR clinic_name_input = '' THEN
    RETURN NULL;
  END IF;

  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  base_slug := lower(regexp_replace(clinic_name_input, '[^a-zA-Z0-9\s-]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);

  -- If empty after cleaning, return null
  IF base_slug = '' THEN
    RETURN NULL;
  END IF;

  final_slug := base_slug;

  -- Check if slug exists, if so add number suffix
  WHILE EXISTS (SELECT 1 FROM profiles WHERE booking_slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 6: AUTO-GENERATE BOOKING SLUGS FOR EXISTING USERS
-- =====================================================

-- Initialize booking slugs for existing profiles that don't have one
DO $$
DECLARE
  profile_record RECORD;
  new_slug TEXT;
BEGIN
  FOR profile_record IN
    SELECT id, clinic_name
    FROM profiles
    WHERE booking_slug IS NULL
      AND clinic_name IS NOT NULL
      AND clinic_name != ''
  LOOP
    new_slug := generate_booking_slug(profile_record.clinic_name);
    IF new_slug IS NOT NULL THEN
      UPDATE profiles
      SET booking_slug = new_slug
      WHERE id = profile_record.id;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- PART 7: AUTO-GENERATE SLUG TRIGGER FOR NEW PROFILES
-- =====================================================

-- Create or replace trigger function to auto-generate booking slug
CREATE OR REPLACE FUNCTION auto_generate_booking_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booking_slug IS NULL AND NEW.clinic_name IS NOT NULL AND NEW.clinic_name != '' THEN
    NEW.booking_slug := generate_booking_slug(NEW.clinic_name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS profiles_auto_booking_slug ON profiles;
CREATE TRIGGER profiles_auto_booking_slug
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION auto_generate_booking_slug();

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================

-- Show success message
DO $$
BEGIN
  RAISE NOTICE '✅ OptiFinance database setup complete!';
  RAISE NOTICE '📅 Appointments table created';
  RAISE NOTICE '🔗 Booking slugs generated';
  RAISE NOTICE '⏰ Availability settings ready';
  RAISE NOTICE '🚀 You can now use the booking system!';
END $$;
