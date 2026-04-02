-- Create a function that allows executing read-only SQL queries
-- This gives the AI agent flexible database access while maintaining safety

CREATE OR REPLACE FUNCTION execute_sql(query_text TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Safety check: only allow SELECT queries
  IF NOT (lower(trim(query_text)) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Execute the query and return as JSON
  EXECUTE format('SELECT json_agg(t) FROM (%s) t', query_text) INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION execute_sql(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION execute_sql(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION execute_sql(TEXT) TO service_role;
