-- Utöka products-tabellen med FDT-referenser
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS fdt_sellus_article_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS fdt_last_synced TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS fdt_sync_status TEXT DEFAULT 'pending';

-- Skapa integrationstabell för att spåra synkroniseringar
CREATE TABLE IF NOT EXISTS fdt_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  fdt_article_id TEXT,
  wms_product_id UUID REFERENCES products(id),
  status TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index för snabbare queries
CREATE INDEX IF NOT EXISTS idx_fdt_sync_log_sync_type ON fdt_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_fdt_sync_log_status ON fdt_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_fdt_sync_log_created_at ON fdt_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_fdt_article_id ON products(fdt_sellus_article_id);

-- Tabell för att spåra senaste synkroniseringen
CREATE TABLE IF NOT EXISTS fdt_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT UNIQUE NOT NULL,
  last_successful_sync TIMESTAMPTZ,
  last_error TEXT,
  total_synced INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lägg till initiala rader
INSERT INTO fdt_sync_status (sync_type) VALUES 
  ('product_import'),
  ('inventory_export'),
  ('sale_import')
ON CONFLICT (sync_type) DO NOTHING;

-- Enable RLS för nya tabeller
ALTER TABLE fdt_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fdt_sync_status ENABLE ROW LEVEL SECURITY;

-- RLS policies - alla autentiserade användare kan läsa
CREATE POLICY "Anyone can view sync logs" 
ON fdt_sync_log FOR SELECT USING (true);

CREATE POLICY "Anyone can view sync status" 
ON fdt_sync_status FOR SELECT USING (true);

-- Endast autentiserade kan skriva (för edge functions)
CREATE POLICY "Authenticated users can insert sync logs" 
ON fdt_sync_log FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update sync status" 
ON fdt_sync_status FOR UPDATE 
USING (true);

-- Funktion som notifierar vid lagerändring
CREATE OR REPLACE FUNCTION notify_inventory_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'inventory_changed',
    json_build_object(
      'product_id', NEW.product_id,
      'location_id', NEW.location_id,
      'quantity', NEW.quantity
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger som aktiveras vid inventory-ändringar
DROP TRIGGER IF EXISTS inventory_change_trigger ON inventory;
CREATE TRIGGER inventory_change_trigger
AFTER INSERT OR UPDATE ON inventory
FOR EACH ROW
EXECUTE FUNCTION notify_inventory_change();