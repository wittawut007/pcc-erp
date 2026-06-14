-- Migration: 009_db_stats_function.sql
-- Description: Create get_db_stats RPC function to fetch Postgres, Auth, and Storage usage metrics.

CREATE OR REPLACE FUNCTION get_db_stats()
RETURNS jsonb
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  db_size bigint;
  table_stats jsonb;
  conn_stats jsonb;
  auth_stats jsonb;
  storage_stats jsonb;
BEGIN
  -- 1. Database size
  SELECT pg_database_size(current_database()) INTO db_size;

  -- 2. Table stats (data size, index size, row counts)
  SELECT jsonb_agg(t) INTO table_stats
  FROM (
    SELECT 
      n.nspname || '.' || c.relname AS table_name,
      pg_stat_get_live_tuples(c.oid) AS row_count,
      pg_total_relation_size(c.oid) AS total_size,
      pg_relation_size(c.oid) AS table_size,
      pg_total_relation_size(c.oid) - pg_relation_size(c.oid) AS index_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' 
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND pg_total_relation_size(c.oid) > 0
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 15
  ) t;

  -- 3. Connection stats
  SELECT jsonb_build_object(
    'active', count(*),
    'max', (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')
  ) INTO conn_stats
  FROM pg_stat_activity;

  -- 4. Auth stats
  SELECT jsonb_build_object(
    'total_users', count(*),
    'created_last_30_days', count(*) FILTER (WHERE created_at > now() - interval '30 days')
  ) INTO auth_stats
  FROM auth.users;

  -- 5. Storage stats (bucket counts, total storage size)
  SELECT jsonb_build_object(
    'total_size', COALESCE(sum((metadata->>'size')::bigint), 0),
    'total_files', count(*),
    'buckets', COALESCE((
      SELECT jsonb_agg(b) FROM (
        SELECT 
          b.id,
          b.name,
          count(o.id) as file_count,
          COALESCE(sum((o.metadata->>'size')::bigint), 0) as total_size
        FROM storage.buckets b
        LEFT JOIN storage.objects o ON o.bucket_id = b.id
        GROUP BY b.id, b.name
      ) b
    ), '[]'::jsonb)
  ) INTO storage_stats
  FROM storage.objects;

  -- 6. Combine all metrics
  result := jsonb_build_object(
    'db_size', db_size,
    'tables', COALESCE(table_stats, '[]'::jsonb),
    'connections', conn_stats,
    'auth', auth_stats,
    'storage', storage_stats,
    'postgres_version', version()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Secure the function: Revoke execution rights from public and grant to service_role only.
REVOKE EXECUTE ON FUNCTION get_db_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_db_stats() TO service_role;
GRANT EXECUTE ON FUNCTION get_db_stats() TO postgres;
