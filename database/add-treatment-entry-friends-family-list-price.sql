-- Standard list price at time of visit (for invoices / audit when F&F applied)
ALTER TABLE treatment_entries
  ADD COLUMN IF NOT EXISTS friends_family_list_price DECIMAL(10, 2) NULL;
