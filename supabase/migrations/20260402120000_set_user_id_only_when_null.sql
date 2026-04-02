-- Service-role Edge inserts pass user_id explicitly; BEFORE INSERT was overwriting with auth.uid() (NULL).
-- Only fill user_id when the row did not already set it.
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
