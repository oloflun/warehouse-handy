-- Add flag to track when quantity is manually modified (differs from packing slip)
ALTER TABLE public.delivery_note_items 
ADD COLUMN quantity_modified BOOLEAN DEFAULT false;

-- Add index for finding modified items
CREATE INDEX idx_delivery_note_items_quantity_modified 
ON public.delivery_note_items(quantity_modified) 
WHERE quantity_modified = true;
