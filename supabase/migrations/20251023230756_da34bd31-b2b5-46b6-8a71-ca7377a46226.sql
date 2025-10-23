-- Ta bort orderrader där fdt_article_id inte matchar någon produkt (orphaned lines)
DELETE FROM order_lines ol
WHERE NOT EXISTS (
  SELECT 1 FROM products p 
  WHERE p.fdt_sellus_article_id = ol.fdt_article_id 
     OR p.barcode = ol.fdt_article_id
)
AND ol.product_id IS NULL;

-- Skapa tabell för att spåra synk-metadata
CREATE TABLE IF NOT EXISTS fdt_sync_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  last_sync_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_items_in_fdt INTEGER,
  total_items_in_wms INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE fdt_sync_metadata ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view sync metadata
CREATE POLICY "Anyone can view sync metadata"
  ON fdt_sync_metadata
  FOR SELECT
  USING (true);

-- Allow authenticated users to insert sync metadata
CREATE POLICY "Authenticated users can insert sync metadata"
  ON fdt_sync_metadata
  FOR INSERT
  WITH CHECK (true);