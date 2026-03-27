-- Run this SQL in your Supabase SQL Editor to enable the booking system

-- 1. Add booking_slug to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_slug TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN DEFAULT true;

-- Create index for fast booking page lookups
CREATE INDEX IF NOT EXISTS idx_profiles_booking_slug ON profiles(booking_slug);

-- 2. Create availability_settings table
CREATE TABLE IF NOT EXISTS availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Working hours (JSON object with day: {start, end, enabled})
  -- Example: {"monday": {"start": "09:00", "end": "17:00", "enabled": true}}
  working_hours JSONB DEFAULT '{
    "monday": {"start": "09:00", "end": "17:00", "enabled": true},
    "tuesday": {"start": "09:00", "end": "17:00", "enabled": true},
    "wednesday": {"start": "09:00", "end": "17:00", "enabled": true},
    "thursday": {"start": "09:00", "end": "17:00", "enabled": true},
    "friday": {"start": "09:00", "end": "17:00", "enabled": true},
    "saturday": {"start": "09:00", "end": "17:00", "enabled": false},
    "sunday": {"start": "09:00", "end": "17:00", "enabled": false}
  }'::jsonb,

  -- Break times (array of {start, end})
  breaks JSONB DEFAULT '[]'::jsonb,

  -- Buffer time between appointments (minutes)
  buffer_time INTEGER DEFAULT 15,

  -- Default appointment duration (minutes)
  default_duration INTEGER DEFAULT 30,

  -- Advance booking settings
  min_booking_notice INTEGER DEFAULT 60, -- minutes
  max_booking_advance INTEGER DEFAULT 60, -- days

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE availability_settings ENABLE ROW LEVEL SECURITY;

-- Policies for availability_settings
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

-- 3. Add patient contact fields to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_email TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_phone TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'manual'; -- 'manual', 'online', 'voice'
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN DEFAULT false;

-- 4. Create function to automatically update updated_at for availability_settings
CREATE OR REPLACE FUNCTION update_availability_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS availability_settings_updated_at_trigger ON availability_settings;
CREATE TRIGGER availability_settings_updated_at_trigger
BEFORE UPDATE ON availability_settings
FOR EACH ROW
EXECUTE FUNCTION update_availability_settings_updated_at();

-- 5. Function to generate unique booking slug from clinic name
CREATE OR REPLACE FUNCTION generate_booking_slug(clinic_name_input TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  base_slug := lower(regexp_replace(clinic_name_input, '[^a-zA-Z0-9\s-]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);

  final_slug := base_slug;

  -- Check if slug exists, if so add number suffix
  WHILE EXISTS (SELECT 1 FROM profiles WHERE booking_slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- 6. Initialize booking slugs for existing profiles
DO $$
DECLARE
  profile_record RECORD;
  new_slug TEXT;
BEGIN
  FOR profile_record IN
    SELECT id, clinic_name
    FROM profiles
    WHERE booking_slug IS NULL AND clinic_name IS NOT NULL AND clinic_name != ''
  LOOP
    new_slug := generate_booking_slug(profile_record.clinic_name);
    UPDATE profiles
    SET booking_slug = new_slug
    WHERE id = profile_record.id;
  END LOOP;
END $$;

-- 7. Create trigger to auto-generate booking slug when profile is created/updated
CREATE OR REPLACE FUNCTION auto_generate_booking_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booking_slug IS NULL AND NEW.clinic_name IS NOT NULL AND NEW.clinic_name != '' THEN
    NEW.booking_slug := generate_booking_slug(NEW.clinic_name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_auto_booking_slug ON profiles;
CREATE TRIGGER profiles_auto_booking_slug
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION auto_generate_booking_slug();
