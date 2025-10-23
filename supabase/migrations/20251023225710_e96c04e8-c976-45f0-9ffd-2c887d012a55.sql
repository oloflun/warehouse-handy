-- Uppdatera products: använd barcode som fdt_sellus_article_id där barcode finns
UPDATE products
SET fdt_sellus_article_id = barcode
WHERE barcode IS NOT NULL 
  AND barcode != ''
  AND fdt_sellus_article_id != barcode;

-- Skapa en temporary mapping table för att mappa gamla ID:n till nya
CREATE TEMP TABLE article_mapping AS
SELECT 
  fdt_sellus_article_id as old_id,
  barcode as new_id,
  id as product_id
FROM products
WHERE barcode IS NOT NULL AND barcode != '';

-- Uppdatera order_lines med rätt fdt_article_id och product_id
UPDATE order_lines ol
SET 
  fdt_article_id = am.new_id,
  product_id = am.product_id
FROM article_mapping am
WHERE ol.fdt_article_id = am.old_id
  AND (ol.product_id IS NULL OR ol.product_id != am.product_id);

-- Cleanup temporary table
DROP TABLE article_mapping;