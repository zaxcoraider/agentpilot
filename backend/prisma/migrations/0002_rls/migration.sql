-- ─── Enable RLS on all tables ────────────────────────────────────────────────
ALTER TABLE "User"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agent"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Action"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DCAPlan"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;

-- ─── Service role bypass (backend API full access) ────────────────────────────
-- The backend connects as the service_role — grant it unrestricted access.
-- This means Prisma can read/write everything while RLS blocks anon/authenticated.

CREATE POLICY "service_role_all" ON "User"         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Agent"        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Action"       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "DCAPlan"      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Alert"        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Subscription" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Auto-RLS event trigger (fires on every future CREATE TABLE) ───────────────
CREATE OR REPLACE FUNCTION auto_enable_rls()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
      AND schema_name = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', obj.schema_name, obj.object_identity);
    RAISE NOTICE 'RLS enabled on %.%', obj.schema_name, obj.object_identity;
  END LOOP;
END;
$$;

CREATE EVENT TRIGGER auto_rls_on_create_table
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION auto_enable_rls();
