-- Clinical notes: structured visit/clinical documentation per patient (voice + manual).
-- Run this in Supabase SQL Editor after other schema is applied.

CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_entry_id UUID REFERENCES treatment_entries(id) ON DELETE SET NULL,
  visit_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  raw_narrative TEXT,
  structured JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT clinical_notes_source_check CHECK (source IN ('manual', 'voice_diary'))
);

CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_id ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_visit_date ON clinical_notes(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_treatment_entry_id ON clinical_notes(treatment_entry_id);

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own clinical_notes"
  ON clinical_notes FOR ALL
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_clinical_notes_user_id ON clinical_notes;
CREATE TRIGGER set_clinical_notes_user_id
  BEFORE INSERT ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

DROP TRIGGER IF EXISTS update_clinical_notes_updated_at ON clinical_notes;
CREATE TRIGGER update_clinical_notes_updated_at
  BEFORE UPDATE ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
