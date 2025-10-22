-- Fix function search path for notify_inventory_change
CREATE OR REPLACE FUNCTION public.notify_inventory_change()
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
$$ LANGUAGE plpgsql 
SET search_path = public;