-- Function to execute SQL queries
CREATE OR REPLACE FUNCTION execute_sql(sql_query text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || sql_query || ') t' INTO result;
  RETURN result;
END;
$$;
