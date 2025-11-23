-- Add supplier_name column to delivery_notes table
ALTER TABLE public.delivery_notes ADD COLUMN supplier_name TEXT;

-- Create index for supplier_name for faster queries
CREATE INDEX idx_delivery_notes_supplier ON public.delivery_notes(supplier_name);
