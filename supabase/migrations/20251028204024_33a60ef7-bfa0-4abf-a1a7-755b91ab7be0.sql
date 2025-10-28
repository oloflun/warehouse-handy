-- Enable pg_net extension for HTTP calls from database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Create function to trigger auto-resolve for new products
CREATE OR REPLACE FUNCTION public.trigger_auto_resolve_item_id()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Get Supabase URL and service role key from environment
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If settings are not available, use default construction
  IF supabase_url IS NULL THEN
    supabase_url := 'https://qadtpwdokdfqtpvwwhsn.supabase.co';
  END IF;
  
  -- Trigger auto-resolve edge function asynchronously
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/auto-resolve-item-id',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, current_setting('request.headers', true)::json->>'authorization')
    ),
    body := jsonb_build_object('productId', NEW.id::text)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Create trigger for auto-resolving new products
DROP TRIGGER IF EXISTS auto_resolve_new_product_id ON public.products;
CREATE TRIGGER auto_resolve_new_product_id
  AFTER INSERT OR UPDATE OF fdt_sellus_article_id ON public.products
  FOR EACH ROW
  WHEN (NEW.fdt_sellus_article_id IS NOT NULL AND NEW.fdt_sellus_item_numeric_id IS NULL)
  EXECUTE FUNCTION public.trigger_auto_resolve_item_id();

-- Update the existing notify_inventory_change function to also trigger Sellus sync
CREATE OR REPLACE FUNCTION public.notify_inventory_change()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Schedule retry-failed-syncs to run every 5 minutes
SELECT cron.schedule(
  'retry-failed-sellus-syncs',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qadtpwdokdfqtpvwwhsn.supabase.co/functions/v1/retry-failed-syncs',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
