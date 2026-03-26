-- Outbound/inbound communication log (currently outbound SMS only).
CREATE TABLE IF NOT EXISTS communication_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  patient_name TEXT NOT NULL,
  patient_contact TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  direction TEXT NOT NULL DEFAULT 'outbound',
  status TEXT NOT NULL DEFAULT 'sent',
  message_body TEXT NOT NULL,
  related_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  provider_message_sid TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT communication_messages_channel_check CHECK (channel IN ('sms', 'email', 'whatsapp')),
  CONSTRAINT communication_messages_direction_check CHECK (direction IN ('outbound', 'inbound')),
  CONSTRAINT communication_messages_status_check CHECK (status IN ('sent', 'failed', 'queued', 'delivered'))
);

CREATE INDEX IF NOT EXISTS idx_communication_messages_user_created_at
  ON communication_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_messages_patient_contact
  ON communication_messages(patient_contact);
CREATE INDEX IF NOT EXISTS idx_communication_messages_related_invoice
  ON communication_messages(related_invoice_id);

ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own communication_messages"
  ON communication_messages FOR ALL
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_communication_messages_user_id ON communication_messages;
CREATE TRIGGER set_communication_messages_user_id
  BEFORE INSERT ON communication_messages
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

DROP TRIGGER IF EXISTS update_communication_messages_updated_at ON communication_messages;
CREATE TRIGGER update_communication_messages_updated_at
  BEFORE UPDATE ON communication_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
