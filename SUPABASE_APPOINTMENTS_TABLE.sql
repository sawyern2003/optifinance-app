-- Run this SQL in your Supabase SQL Editor to create the appointments table

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT,
  treatment_name TEXT,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  duration_minutes INTEGER,
  price DECIMAL(10,2),
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see only their own appointments
CREATE POLICY "Users can view their own appointments"
  ON appointments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own appointments
CREATE POLICY "Users can insert their own appointments"
  ON appointments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own appointments
CREATE POLICY "Users can update their own appointments"
  ON appointments
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own appointments
CREATE POLICY "Users can delete their own appointments"
  ON appointments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster date queries
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_user_date ON appointments(user_id, date);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function
CREATE TRIGGER appointments_updated_at_trigger
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_appointments_updated_at();
