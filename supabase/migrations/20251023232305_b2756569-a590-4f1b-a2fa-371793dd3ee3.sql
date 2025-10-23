-- Phase 1: Fix Critical Security Issues
-- 1. Restrict orders table to authenticated users only
DROP POLICY IF EXISTS "Anyone can view orders" ON orders;
CREATE POLICY "Authenticated users can view orders" ON orders
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 2. Restrict order_lines table to authenticated users only
DROP POLICY IF EXISTS "Anyone can view order lines" ON order_lines;
DROP POLICY IF EXISTS "Authenticated users can manage order lines" ON order_lines;

CREATE POLICY "Authenticated users can view order lines" ON order_lines
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage order lines" ON order_lines
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Restrict fdt_sync_log to authenticated users only
DROP POLICY IF EXISTS "Anyone can view sync logs" ON fdt_sync_log;
CREATE POLICY "Authenticated users can view sync logs" ON fdt_sync_log
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 4. Restrict fdt_sync_metadata to authenticated users only
DROP POLICY IF EXISTS "Anyone can view sync metadata" ON fdt_sync_metadata;
CREATE POLICY "Authenticated users can view sync metadata" ON fdt_sync_metadata
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 5. Restrict fdt_sync_status to authenticated users only
DROP POLICY IF EXISTS "Anyone can view sync status" ON fdt_sync_status;
CREATE POLICY "Authenticated users can view sync status" ON fdt_sync_status
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);