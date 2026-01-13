-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  clinic_name TEXT,
  bank_name TEXT,
  account_number TEXT,
  sort_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Practitioners table
CREATE TABLE IF NOT EXISTS practitioners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_lead BOOLEAN DEFAULT FALSE,
  contact TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Treatment Catalog table
CREATE TABLE IF NOT EXISTS treatment_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  treatment_name TEXT NOT NULL,
  default_price DECIMAL(10, 2),
  default_duration_minutes INTEGER,
  category TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Treatment Entries table
CREATE TABLE IF NOT EXISTS treatment_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT,
  treatment_id UUID REFERENCES treatment_catalog(id) ON DELETE SET NULL,
  treatment_name TEXT,
  price_paid DECIMAL(10, 2),
  payment_status TEXT DEFAULT 'pending',
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  practitioner_id UUID REFERENCES practitioners(id) ON DELETE SET NULL,
  practitioner_name TEXT,
  duration_minutes INTEGER,
  product_cost DECIMAL(10, 2),
  profit DECIMAL(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  category TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  receipt_url TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  recurrence_frequency TEXT, -- 'weekly', 'monthly', 'yearly'
  last_generated_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  treatment_entry_id UUID REFERENCES treatment_entries(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_contact TEXT,
  treatment_name TEXT,
  treatment_date DATE,
  amount DECIMAL(10, 2) NOT NULL,
  practitioner_name TEXT,
  issue_date DATE NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'sent', 'paid', 'overdue'
  notes TEXT,
  invoice_pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Export History table
CREATE TABLE IF NOT EXISTS export_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL, -- 'treatment_entries', 'expenses', 'reports'
  file_url TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitor Pricing table
CREATE TABLE IF NOT EXISTS competitor_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  treatment_name TEXT NOT NULL,
  competitor_name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax Settings table
CREATE TABLE IF NOT EXISTS tax_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_structure TEXT DEFAULT 'sole_trader', -- 'sole_trader', 'partnership', 'limited_company'
  vat_registered BOOLEAN DEFAULT FALSE,
  vat_number TEXT,
  vat_scheme TEXT DEFAULT 'standard', -- 'standard', 'flat_rate'
  flat_rate_percentage DECIMAL(5, 2),
  company_number TEXT,
  utr_number TEXT,
  accounting_year_end TEXT,
  tax_year_start DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat History table
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT, -- active, canceled, past_due, incomplete, incomplete_expired, trialing, unpaid
  plan_id TEXT,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own patients" ON patients FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own practitioners" ON practitioners FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own treatment_catalog" ON treatment_catalog FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own treatment_entries" ON treatment_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own expenses" ON expenses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own invoices" ON invoices FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own export_history" ON export_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own competitor_pricing" ON competitor_pricing FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own tax_settings" ON tax_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own chat_history" ON chat_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own subscriptions" ON subscriptions FOR ALL USING (auth.uid() = user_id);

-- Functions to automatically set user_id
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers to auto-set user_id on insert
CREATE TRIGGER set_patients_user_id BEFORE INSERT ON patients FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_practitioners_user_id BEFORE INSERT ON practitioners FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_treatment_catalog_user_id BEFORE INSERT ON treatment_catalog FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_treatment_entries_user_id BEFORE INSERT ON treatment_entries FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_expenses_user_id BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_invoices_user_id BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_export_history_user_id BEFORE INSERT ON export_history FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_competitor_pricing_user_id BEFORE INSERT ON competitor_pricing FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_tax_settings_user_id BEFORE INSERT ON tax_settings FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_chat_history_user_id BEFORE INSERT ON chat_history FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER set_subscriptions_user_id BEFORE INSERT ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_practitioners_updated_at BEFORE UPDATE ON practitioners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_treatment_catalog_updated_at BEFORE UPDATE ON treatment_catalog FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_treatment_entries_updated_at BEFORE UPDATE ON treatment_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_competitor_pricing_updated_at BEFORE UPDATE ON competitor_pricing FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tax_settings_updated_at BEFORE UPDATE ON tax_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_history_updated_at BEFORE UPDATE ON chat_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
