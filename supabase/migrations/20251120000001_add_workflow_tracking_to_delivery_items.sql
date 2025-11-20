-- Add columns to support WMS workflow template tracking
-- These columns help track the association between delivery note items and FDT orders

-- Add order_id to link to WMS orders table
ALTER TABLE public.delivery_note_items 
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id);

-- Add fdt_order_id to track the FDT Sellus order ID
ALTER TABLE public.delivery_note_items 
ADD COLUMN IF NOT EXISTS fdt_order_id TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_delivery_note_items_order_id 
  ON public.delivery_note_items(order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_note_items_fdt_order_id 
  ON public.delivery_note_items(fdt_order_id);

-- Add comment to explain the workflow
COMMENT ON COLUMN public.delivery_note_items.order_id IS 
  'WMS internal order ID - linked during workflow processing';

COMMENT ON COLUMN public.delivery_note_items.fdt_order_id IS 
  'FDT Sellus order ID - used for tracking the source order from Sellus API';
