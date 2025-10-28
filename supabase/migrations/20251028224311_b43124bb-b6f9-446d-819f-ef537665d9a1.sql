-- Fix the inventory trigger to use UPSERT for 'out' transactions
-- This ensures inventory is updated even if no row exists yet

CREATE OR REPLACE FUNCTION public.update_inventory_on_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'in' THEN
    -- Upsert for incoming transactions
    INSERT INTO public.inventory (product_id, location_id, quantity, last_updated)
    VALUES (NEW.product_id, NEW.location_id, NEW.quantity, now())
    ON CONFLICT (product_id, location_id) 
    DO UPDATE SET 
      quantity = public.inventory.quantity + NEW.quantity,
      last_updated = now();
      
  ELSIF NEW.type = 'out' THEN
    -- Upsert for outgoing transactions (picks)
    -- This creates a row with negative quantity if none exists
    INSERT INTO public.inventory (product_id, location_id, quantity, last_updated)
    VALUES (NEW.product_id, NEW.location_id, -NEW.quantity, now())
    ON CONFLICT (product_id, location_id) 
    DO UPDATE SET 
      quantity = public.inventory.quantity - NEW.quantity,
      last_updated = now();
  END IF;
  
  RETURN NEW;
END;
$$;