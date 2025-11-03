-- Migration: Cleanup old data and update sync rules for Sellus-only inventory management
-- This migration implements the requirement that inventory should only be updated via Sellus sync

-- 1. Clean up old data (truncate tables while preserving structure)
-- Note: This will delete all existing data as per requirements
TRUNCATE TABLE public.inventory CASCADE;
TRUNCATE TABLE public.products CASCADE;
TRUNCATE TABLE public.orders CASCADE;
TRUNCATE TABLE public.transactions CASCADE;

-- 2. Drop the automatic inventory update trigger since inventory should only update via Sellus
DROP TRIGGER IF EXISTS on_transaction_update_inventory ON public.transactions;

-- 3. Create a new function that only logs transactions but doesn't auto-update inventory
-- Inventory will be updated manually via Sellus sync functions only
CREATE OR REPLACE FUNCTION public.log_transaction_only()
RETURNS TRIGGER AS $$
BEGIN
  -- Transaction is logged, but inventory is NOT automatically updated
  -- Inventory updates will only happen through explicit Sellus sync operations
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Add trigger to log transactions (but not update inventory automatically)
CREATE TRIGGER on_transaction_log_only
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_transaction_only();

-- 5. Add a flag to track if products/inventory are synced with Sellus
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS fdt_sellus_item_id TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error'));

CREATE INDEX IF NOT EXISTS idx_products_fdt_sellus_item_id ON public.products(fdt_sellus_item_id);
CREATE INDEX IF NOT EXISTS idx_products_sync_status ON public.products(sync_status);

-- 6. Add sync tracking to inventory
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error')),
ADD COLUMN IF NOT EXISTS sync_error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_sync_status ON public.inventory(sync_status);

-- 7. Create a table to track sync discrepancies/failures
CREATE TABLE IF NOT EXISTS public.sellus_sync_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'inventory', 'order')),
  entity_id UUID NOT NULL,
  expected_value JSONB,
  actual_value JSONB,
  discrepancy_type TEXT,
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_sync_discrepancies_unresolved ON public.sellus_sync_discrepancies(resolved) WHERE resolved = false;
CREATE INDEX idx_sync_discrepancies_entity ON public.sellus_sync_discrepancies(entity_type, entity_id);
CREATE INDEX idx_sync_discrepancies_severity ON public.sellus_sync_discrepancies(severity);

-- Enable RLS on sync_discrepancies
ALTER TABLE public.sellus_sync_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync discrepancies"
  ON public.sellus_sync_discrepancies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create sync discrepancies"
  ON public.sellus_sync_discrepancies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sync discrepancies"
  ON public.sellus_sync_discrepancies FOR UPDATE
  TO authenticated
  USING (true);

-- 8. Remove any old order retention policies (if they exist)
-- Drop any scheduled cleanup functions or triggers
DROP FUNCTION IF EXISTS public.cleanup_old_orders() CASCADE;
DROP FUNCTION IF EXISTS public.auto_archive_old_orders() CASCADE;

-- 9. Add comment explaining the new sync model
COMMENT ON TABLE public.inventory IS 
'Inventory should ONLY be updated through Sellus sync operations (in/out delivery). 
Manual updates should be avoided. Any discrepancies should be logged in sellus_sync_discrepancies table.';

COMMENT ON TABLE public.products IS 
'Products are synced from Sellus. The fdt_sellus_item_id links to Sellus item ID. 
Product data should only be updated via Sellus sync, not manually.';

COMMENT ON TABLE public.orders IS 
'Orders are synced from Sellus when products are scanned during delivery note processing. 
No retention time limit - orders remain in system indefinitely.';
