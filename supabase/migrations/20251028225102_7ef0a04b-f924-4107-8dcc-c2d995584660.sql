-- Fix inventory data for the refrigerator (122258) that was incorrectly set to -1
-- Change it to +1 to reflect that picking should ADD to inventory
UPDATE inventory 
SET quantity = 1, 
    last_updated = now()
WHERE product_id = 'bf516c11-4114-470b-b875-c59b752e36aa'
  AND location_id = '538a8505-b06c-48e3-b516-fde0aada6e39';