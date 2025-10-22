-- Fix function search path for existing update_inventory_on_transaction function
CREATE OR REPLACE FUNCTION public.update_inventory_on_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.type = 'in' OR NEW.type = 'adjustment' THEN
    INSERT INTO public.inventory (product_id, location_id, quantity)
    VALUES (NEW.product_id, NEW.location_id, NEW.quantity)
    ON CONFLICT (product_id, location_id) 
    DO UPDATE SET 
      quantity = CASE 
        WHEN NEW.type = 'adjustment' THEN NEW.quantity
        ELSE public.inventory.quantity + NEW.quantity
      END,
      last_updated = now();
  ELSIF NEW.type = 'out' THEN
    UPDATE public.inventory 
    SET quantity = quantity - NEW.quantity,
        last_updated = now()
    WHERE product_id = NEW.product_id 
      AND location_id = NEW.location_id;
  END IF;
  RETURN NEW;
END;
$function$;