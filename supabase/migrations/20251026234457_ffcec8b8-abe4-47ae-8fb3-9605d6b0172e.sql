-- Add column for caching resolved Sellus numeric item IDs
ALTER TABLE public.products 
ADD COLUMN fdt_sellus_item_numeric_id TEXT NULL;

-- Add index for faster lookups
CREATE INDEX idx_products_fdt_sellus_item_numeric_id 
ON public.products(fdt_sellus_item_numeric_id) 
WHERE fdt_sellus_item_numeric_id IS NOT NULL;

COMMENT ON COLUMN public.products.fdt_sellus_item_numeric_id IS 'Cached numeric item.id from Sellus for O(1) stock updates';