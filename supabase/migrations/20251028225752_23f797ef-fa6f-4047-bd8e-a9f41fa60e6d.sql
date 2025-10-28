-- Update notify_inventory_change() to automatically sync to Sellus
CREATE OR REPLACE FUNCTION public.notify_inventory_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Send realtime notification (existing functionality)
  PERFORM pg_notify(
    'inventory_changed',
    json_build_object(
      'product_id', NEW.product_id,
      'location_id', NEW.location_id,
      'quantity', NEW.quantity
    )::text
  );
  
  -- Get Supabase URL and service role key
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If settings are not available, use default construction
  IF supabase_url IS NULL THEN
    supabase_url := 'https://qadtpwdokdfqtpvwwhsn.supabase.co';
  END IF;
  
  -- Trigger automatic Sellus sync
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/update-sellus-stock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, current_setting('request.headers', true)::json->>'authorization')
    ),
    body := jsonb_build_object(
      'productId', NEW.product_id::text,
      'quantity', NEW.quantity,
      'locationId', NEW.location_id::text
    )
  );
  
  RETURN NEW;
END;
$$;