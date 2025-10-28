-- Remove the quantity check constraint to allow negative inventory values
-- This is necessary for tracking picks from empty stock (backorders/shortages)
ALTER TABLE public.inventory 
DROP CONSTRAINT IF EXISTS inventory_quantity_check;