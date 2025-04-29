-- Function to get all tables in the public schema
CREATE OR REPLACE FUNCTION get_tables()
RETURNS TABLE (table_name text)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT t.table_name::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN ('schema_migrations', 'pg_stat_statements')
  ORDER BY t.table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get columns for a specific table
CREATE OR REPLACE FUNCTION get_columns(table_name text)
RETURNS TABLE (
  column_name text,
  data_type text,
  is_nullable text,
  column_default text
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text,
    c.column_default::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  AND c.table_name = table_name
  ORDER BY c.ordinal_position;
END;
$$ LANGUAGE plpgsql;
