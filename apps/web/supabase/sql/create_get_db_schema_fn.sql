-- ================================================================
-- Credics — Supabase SQL Editor-এ একবার এই পুরো script রান করুন
-- Path: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ================================================================

CREATE OR REPLACE FUNCTION get_db_schema()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'fetched_at', now(),
    'tables', (
      SELECT json_agg(tbl_info ORDER BY tbl_info->>'name')
      FROM (
        SELECT json_build_object(
          'name', t.table_name,
          'columns', (
            SELECT json_agg(
              json_build_object(
                'name',     c.column_name,
                'type',     c.data_type,
                'nullable', c.is_nullable = 'YES',
                'default',  c.column_default,
                'position', c.ordinal_position
              ) ORDER BY c.ordinal_position
            )
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name   = t.table_name
          ),
          'foreign_keys', (
            SELECT json_agg(
              json_build_object(
                'column',     kcu.column_name,
                'references', ccu.table_name || '.' || ccu.column_name
              )
            )
            FROM information_schema.table_constraints  tc
            JOIN information_schema.key_column_usage   kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema    = tc.table_schema
            WHERE tc.table_schema    = 'public'
              AND tc.table_name      = t.table_name
              AND tc.constraint_type = 'FOREIGN KEY'
          ),
          'indexes', (
            SELECT json_agg(
              json_build_object(
                'name',    ix.indexname,
                'columns', ix.indexdef
              )
            )
            FROM pg_indexes ix
            WHERE ix.schemaname = 'public'
              AND ix.tablename  = t.table_name
          )
        ) AS tbl_info
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type   = 'BASE TABLE'
      ) sub
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Function-টা accessible করুন
GRANT EXECUTE ON FUNCTION get_db_schema() TO anon;
GRANT EXECUTE ON FUNCTION get_db_schema() TO authenticated;
GRANT EXECUTE ON FUNCTION get_db_schema() TO service_role;
