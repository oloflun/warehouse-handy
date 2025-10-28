-- Update known numeric ID for Dammsugare (article 1201)
UPDATE products 
SET fdt_sellus_item_numeric_id = '297091',
    fdt_sync_status = 'synced',
    fdt_last_synced = NOW()
WHERE fdt_sellus_article_id = '1201';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_fdt_article_id 
ON products(fdt_sellus_article_id);

CREATE INDEX IF NOT EXISTS idx_products_fdt_numeric_id 
ON products(fdt_sellus_item_numeric_id);