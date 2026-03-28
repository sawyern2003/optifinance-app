-- Create products table for inventory management
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  sku TEXT,
  category TEXT NOT NULL, -- fillers, toxins, skincare, equipment, consumables, other
  current_stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
  minimum_stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cost_per_unit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'units', -- units, ml, mg, vials, bottles, boxes
  expiry_date DATE,
  supplier TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_expiry_date ON products(expiry_date);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for products
CREATE POLICY "Users can view their own products"
  ON products FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products"
  ON products FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products"
  ON products FOR DELETE
  USING (auth.uid() = user_id);

-- Create fridge_temperatures table for regulatory compliance
CREATE TABLE IF NOT EXISTS fridge_temperatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  temperature DECIMAL(4, 1) NOT NULL, -- e.g., 5.2°C
  time_of_day TEXT NOT NULL, -- 'am' or 'pm'
  notes TEXT,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_fridge_temps_user_id ON fridge_temperatures(user_id);
CREATE INDEX IF NOT EXISTS idx_fridge_temps_logged_at ON fridge_temperatures(logged_at);

-- Enable RLS
ALTER TABLE fridge_temperatures ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for fridge_temperatures
CREATE POLICY "Users can view their own fridge temperatures"
  ON fridge_temperatures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fridge temperatures"
  ON fridge_temperatures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fridge temperatures"
  ON fridge_temperatures FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fridge temperatures"
  ON fridge_temperatures FOR DELETE
  USING (auth.uid() = user_id);

-- Create equipment table for equipment maintenance tracking
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- laser, ultrasound, autoclave, fridge, other
  serial_number TEXT,
  manufacturer TEXT,
  last_service_date DATE,
  next_service_date DATE,
  service_interval_months INTEGER DEFAULT 12,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_equipment_user_id ON equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_next_service_date ON equipment(next_service_date);

-- Enable RLS
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for equipment
CREATE POLICY "Users can view their own equipment"
  ON equipment FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own equipment"
  ON equipment FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own equipment"
  ON equipment FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own equipment"
  ON equipment FOR DELETE
  USING (auth.uid() = user_id);

-- Add updated_at trigger for products
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
