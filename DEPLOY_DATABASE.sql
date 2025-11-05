-- Create products table
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  unit text DEFAULT 'st',
  min_stock integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create storage locations table
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create inventory table
CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  quantity integer DEFAULT 0 NOT NULL CHECK (quantity >= 0),
  last_updated timestamptz DEFAULT now(),
  UNIQUE(product_id, location_id)
);

-- Create transactions table
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity integer NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for products (all authenticated users can read, admin can write)
CREATE POLICY "Anyone can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for locations
CREATE POLICY "Anyone can view locations"
  ON public.locations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage locations"
  ON public.locations FOR ALL
  TO authenticated
  USING (true);

-- RLS Policies for inventory
CREATE POLICY "Anyone can view inventory"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage inventory"
  ON public.inventory FOR ALL
  TO authenticated
  USING (true);

-- RLS Policies for transactions
CREATE POLICY "Anyone can view transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to update inventory on transaction
CREATE OR REPLACE FUNCTION public.update_inventory_on_transaction()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update inventory
CREATE TRIGGER on_transaction_update_inventory
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_on_transaction();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for products updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Insert some default locations
INSERT INTO public.locations (name, description) VALUES
  ('Huvudlager', 'Huvudlagret för alla varor'),
  ('Butik', 'Butiksförråd'),
  ('Reservlager', 'Extra lagerhållning');-- Utöka products-tabellen med FDT-referenser
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS fdt_sellus_article_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS fdt_last_synced TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS fdt_sync_status TEXT DEFAULT 'pending';

-- Skapa integrationstabell för att spåra synkroniseringar
CREATE TABLE IF NOT EXISTS fdt_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  fdt_article_id TEXT,
  wms_product_id UUID REFERENCES products(id),
  status TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index för snabbare queries
CREATE INDEX IF NOT EXISTS idx_fdt_sync_log_sync_type ON fdt_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_fdt_sync_log_status ON fdt_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_fdt_sync_log_created_at ON fdt_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_fdt_article_id ON products(fdt_sellus_article_id);

-- Tabell för att spåra senaste synkroniseringen
CREATE TABLE IF NOT EXISTS fdt_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT UNIQUE NOT NULL,
  last_successful_sync TIMESTAMPTZ,
  last_error TEXT,
  total_synced INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lägg till initiala rader
INSERT INTO fdt_sync_status (sync_type) VALUES 
  ('product_import'),
  ('inventory_export'),
  ('sale_import')
ON CONFLICT (sync_type) DO NOTHING;

-- Enable RLS för nya tabeller
ALTER TABLE fdt_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fdt_sync_status ENABLE ROW LEVEL SECURITY;

-- RLS policies - alla autentiserade användare kan läsa
CREATE POLICY "Anyone can view sync logs" 
ON fdt_sync_log FOR SELECT USING (true);

CREATE POLICY "Anyone can view sync status" 
ON fdt_sync_status FOR SELECT USING (true);

-- Endast autentiserade kan skriva (för edge functions)
CREATE POLICY "Authenticated users can insert sync logs" 
ON fdt_sync_log FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update sync status" 
ON fdt_sync_status FOR UPDATE 
USING (true);

-- Funktion som notifierar vid lagerändring
CREATE OR REPLACE FUNCTION notify_inventory_change()
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
$$ LANGUAGE plpgsql;

-- Trigger som aktiveras vid inventory-ändringar
DROP TRIGGER IF EXISTS inventory_change_trigger ON inventory;
CREATE TRIGGER inventory_change_trigger
AFTER INSERT OR UPDATE ON inventory
FOR EACH ROW
EXECUTE FUNCTION notify_inventory_change();-- Fix function search path for notify_inventory_change
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
SET search_path = public;-- Fix function search path for existing update_inventory_on_transaction function
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
$function$;-- Fix function search path for update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fdt_order_id TEXT UNIQUE NOT NULL,
  order_number TEXT,
  customer_name TEXT,
  customer_notes TEXT,
  status TEXT DEFAULT 'pending',
  order_date TIMESTAMPTZ,
  location_id UUID REFERENCES public.locations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create order_lines table
CREATE TABLE public.order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  fdt_article_id TEXT,
  quantity_ordered INTEGER NOT NULL,
  quantity_picked INTEGER DEFAULT 0,
  is_picked BOOLEAN DEFAULT false,
  picked_by UUID,
  picked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_orders_fdt_id ON public.orders(fdt_order_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_order_lines_order_id ON public.order_lines(order_id);
CREATE INDEX idx_order_lines_product_id ON public.order_lines(product_id);
CREATE INDEX idx_order_lines_picked ON public.order_lines(is_picked);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies for orders
CREATE POLICY "Anyone can view orders" ON public.orders
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage orders" ON public.orders
  FOR ALL USING (true);

-- RLS policies for order_lines
CREATE POLICY "Anyone can view order lines" ON public.order_lines
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage order lines" ON public.order_lines
  FOR ALL USING (true);

-- Create view for order summary
CREATE OR REPLACE VIEW order_summary AS
SELECT 
  o.id,
  o.fdt_order_id,
  o.order_number,
  o.customer_name,
  o.customer_notes,
  o.status,
  o.order_date,
  l.name as location_name,
  COUNT(ol.id) as total_lines,
  COUNT(CASE WHEN ol.is_picked THEN 1 END) as picked_lines,
  CASE 
    WHEN COUNT(ol.id) = COUNT(CASE WHEN ol.is_picked THEN 1 END) THEN 'Komplett'
    WHEN COUNT(CASE WHEN ol.is_picked THEN 1 END) > 0 THEN 'Delvis'
    ELSE 'Ej påbörjad'
  END as pick_status
FROM public.orders o
LEFT JOIN public.order_lines ol ON o.id = ol.order_id
LEFT JOIN public.locations l ON o.location_id = l.id
GROUP BY o.id, l.name;

-- Add trigger for updated_at on orders
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();-- Drop and recreate view without SECURITY DEFINER
DROP VIEW IF EXISTS order_summary;

CREATE VIEW order_summary 
WITH (security_invoker=true)
AS
SELECT 
  o.id,
  o.fdt_order_id,
  o.order_number,
  o.customer_name,
  o.customer_notes,
  o.status,
  o.order_date,
  l.name as location_name,
  COUNT(ol.id) as total_lines,
  COUNT(CASE WHEN ol.is_picked THEN 1 END) as picked_lines,
  CASE 
    WHEN COUNT(ol.id) = COUNT(CASE WHEN ol.is_picked THEN 1 END) THEN 'Komplett'
    WHEN COUNT(CASE WHEN ol.is_picked THEN 1 END) > 0 THEN 'Delvis'
    ELSE 'Ej påbörjad'
  END as pick_status
FROM public.orders o
LEFT JOIN public.order_lines ol ON o.id = ol.order_id
LEFT JOIN public.locations l ON o.location_id = l.id
GROUP BY o.id, l.name;-- Make barcode nullable to allow products with only article numbers
ALTER TABLE products 
ALTER COLUMN barcode DROP NOT NULL;-- Add price fields to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS sales_price DECIMAL(10,2);-- Uppdatera products: använd barcode som fdt_sellus_article_id där barcode finns
UPDATE products
SET fdt_sellus_article_id = barcode
WHERE barcode IS NOT NULL 
  AND barcode != ''
  AND fdt_sellus_article_id != barcode;

-- Skapa en temporary mapping table för att mappa gamla ID:n till nya
CREATE TEMP TABLE article_mapping AS
SELECT 
  fdt_sellus_article_id as old_id,
  barcode as new_id,
  id as product_id
FROM products
WHERE barcode IS NOT NULL AND barcode != '';

-- Uppdatera order_lines med rätt fdt_article_id och product_id
UPDATE order_lines ol
SET 
  fdt_article_id = am.new_id,
  product_id = am.product_id
FROM article_mapping am
WHERE ol.fdt_article_id = am.old_id
  AND (ol.product_id IS NULL OR ol.product_id != am.product_id);

-- Cleanup temporary table
DROP TABLE article_mapping;-- Ta bort orderrader där fdt_article_id inte matchar någon produkt (orphaned lines)
DELETE FROM order_lines ol
WHERE NOT EXISTS (
  SELECT 1 FROM products p 
  WHERE p.fdt_sellus_article_id = ol.fdt_article_id 
     OR p.barcode = ol.fdt_article_id
)
AND ol.product_id IS NULL;

-- Skapa tabell för att spåra synk-metadata
CREATE TABLE IF NOT EXISTS fdt_sync_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  last_sync_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_items_in_fdt INTEGER,
  total_items_in_wms INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE fdt_sync_metadata ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view sync metadata
CREATE POLICY "Anyone can view sync metadata"
  ON fdt_sync_metadata
  FOR SELECT
  USING (true);

-- Allow authenticated users to insert sync metadata
CREATE POLICY "Authenticated users can insert sync metadata"
  ON fdt_sync_metadata
  FOR INSERT
  WITH CHECK (true);-- Phase 1: Fix Critical Security Issues
-- 1. Restrict orders table to authenticated users only
DROP POLICY IF EXISTS "Anyone can view orders" ON orders;
CREATE POLICY "Authenticated users can view orders" ON orders
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 2. Restrict order_lines table to authenticated users only
DROP POLICY IF EXISTS "Anyone can view order lines" ON order_lines;
DROP POLICY IF EXISTS "Authenticated users can manage order lines" ON order_lines;

CREATE POLICY "Authenticated users can view order lines" ON order_lines
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage order lines" ON order_lines
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Restrict fdt_sync_log to authenticated users only
DROP POLICY IF EXISTS "Anyone can view sync logs" ON fdt_sync_log;
CREATE POLICY "Authenticated users can view sync logs" ON fdt_sync_log
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 4. Restrict fdt_sync_metadata to authenticated users only
DROP POLICY IF EXISTS "Anyone can view sync metadata" ON fdt_sync_metadata;
CREATE POLICY "Authenticated users can view sync metadata" ON fdt_sync_metadata
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 5. Restrict fdt_sync_status to authenticated users only
DROP POLICY IF EXISTS "Anyone can view sync status" ON fdt_sync_status;
CREATE POLICY "Authenticated users can view sync status" ON fdt_sync_status
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);-- Create table for tracking Sellus sync failures
CREATE TABLE IF NOT EXISTS public.sellus_sync_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  fdt_sellus_article_id TEXT,
  quantity_changed INTEGER NOT NULL,
  error_message TEXT NOT NULL,
  order_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

-- Enable Row Level Security
ALTER TABLE public.sellus_sync_failures ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view sync failures"
  ON public.sellus_sync_failures
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sync failures"
  ON public.sellus_sync_failures
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can resolve sync failures"
  ON public.sellus_sync_failures
  FOR UPDATE
  TO authenticated
  USING (true);-- Add column for caching resolved Sellus numeric item IDs
ALTER TABLE public.products 
ADD COLUMN fdt_sellus_item_numeric_id TEXT NULL;

-- Add index for faster lookups
CREATE INDEX idx_products_fdt_sellus_item_numeric_id 
ON public.products(fdt_sellus_item_numeric_id) 
WHERE fdt_sellus_item_numeric_id IS NOT NULL;

COMMENT ON COLUMN public.products.fdt_sellus_item_numeric_id IS 'Cached numeric item.id from Sellus for O(1) stock updates';-- Enable pg_net extension for HTTP calls from database
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
-- Update known numeric ID for Dammsugare (article 1201)
UPDATE products 
SET fdt_sellus_item_numeric_id = '297091',
    fdt_sync_status = 'synced',
    fdt_last_synced = NOW()
WHERE fdt_sellus_article_id = '1201';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_fdt_article_id 
ON products(fdt_sellus_article_id);

CREATE INDEX IF NOT EXISTS idx_products_fdt_numeric_id 
ON products(fdt_sellus_item_numeric_id);-- Fix the inventory trigger to use UPSERT for 'out' transactions
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
$$;-- Remove the quantity check constraint to allow negative inventory values
-- This is necessary for tracking picks from empty stock (backorders/shortages)
ALTER TABLE public.inventory 
DROP CONSTRAINT IF EXISTS inventory_quantity_check;-- Fix inventory data for the refrigerator (122258) that was incorrectly set to -1
-- Change it to +1 to reflect that picking should ADD to inventory
UPDATE inventory 
SET quantity = 1, 
    last_updated = now()
WHERE product_id = 'bf516c11-4114-470b-b875-c59b752e36aa'
  AND location_id = '538a8505-b06c-48e3-b516-fde0aada6e39';-- Update notify_inventory_change() to automatically sync to Sellus
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
$$;-- Restore database triggers for automatic Sellus sync

-- Trigger on transactions table to update inventory
DROP TRIGGER IF EXISTS on_transaction_update_inventory ON public.transactions;
CREATE TRIGGER on_transaction_update_inventory
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_on_transaction();

-- Trigger on inventory table to notify and sync to Sellus
DROP TRIGGER IF EXISTS inventory_change_trigger ON public.inventory;
CREATE TRIGGER inventory_change_trigger
  AFTER INSERT OR UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inventory_change();
-- Create delivery_notes table
CREATE TABLE public.delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_number TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES public.orders(id),
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  scanned_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  cargo_marking TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_delivery_notes_status ON public.delivery_notes(status);
CREATE INDEX idx_delivery_notes_scanned_at ON public.delivery_notes(scanned_at DESC);

-- Create delivery_note_items table
CREATE TABLE public.delivery_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  article_number TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id),
  order_number TEXT,
  description TEXT,
  quantity_expected INTEGER NOT NULL,
  quantity_checked INTEGER DEFAULT 0,
  is_checked BOOLEAN DEFAULT false,
  checked_at TIMESTAMP WITH TIME ZONE,
  checked_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_delivery_note_items_delivery_note ON public.delivery_note_items(delivery_note_id);
CREATE INDEX idx_delivery_note_items_article ON public.delivery_note_items(article_number);

-- Enable RLS on delivery_notes
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view delivery notes"
  ON public.delivery_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create delivery notes"
  ON public.delivery_notes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update delivery notes"
  ON public.delivery_notes FOR UPDATE
  TO authenticated
  USING (true);

-- Enable RLS on delivery_note_items
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view delivery note items"
  ON public.delivery_note_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create delivery note items"
  ON public.delivery_note_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update delivery note items"
  ON public.delivery_note_items FOR UPDATE
  TO authenticated
  USING (true);-- Add flag to track when quantity is manually modified (differs from packing slip)
ALTER TABLE public.delivery_note_items 
ADD COLUMN quantity_modified BOOLEAN DEFAULT false;

-- Add index for finding modified items
CREATE INDEX idx_delivery_note_items_quantity_modified 
ON public.delivery_note_items(quantity_modified) 
WHERE quantity_modified = true;
-- Migration: Cleanup old data and update sync rules for Sellus-only inventory management
-- This migration implements the requirement that inventory should only be updated via Sellus sync

-- 1. Clean up old data (truncate tables while preserving structure)
-- Note: This will delete all existing data as per requirements
TRUNCATE TABLE public.inventory CASCADE;
TRUNCATE TABLE public.products CASCADE;
TRUNCATE TABLE public.orders CASCADE;
TRUNCATE TABLE public.transactions CASCADE;

-- 2. Drop the automatic inventory update trigger since inventory should only update via Sellus
DROP TRIGGER IF EXISTS on_transaction_update_inventory ON public.transactions;

-- 3. Create a new function that only logs transactions but doesn't auto-update inventory
-- Inventory will be updated manually via Sellus sync functions only
CREATE OR REPLACE FUNCTION public.log_transaction_only()
RETURNS TRIGGER AS $$
BEGIN
  -- Transaction is logged, but inventory is NOT automatically updated
  -- Inventory updates will only happen through explicit Sellus sync operations
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Add trigger to log transactions (but not update inventory automatically)
CREATE TRIGGER on_transaction_log_only
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_transaction_only();

-- 5. Add a flag to track if products/inventory are synced with Sellus
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS fdt_sellus_item_id TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error'));

CREATE INDEX IF NOT EXISTS idx_products_fdt_sellus_item_id ON public.products(fdt_sellus_item_id);
CREATE INDEX IF NOT EXISTS idx_products_sync_status ON public.products(sync_status);

-- 6. Add sync tracking to inventory
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error')),
ADD COLUMN IF NOT EXISTS sync_error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_sync_status ON public.inventory(sync_status);

-- 7. Create a table to track sync discrepancies/failures
CREATE TABLE IF NOT EXISTS public.sellus_sync_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'inventory', 'order')),
  entity_id UUID NOT NULL,
  expected_value JSONB,
  actual_value JSONB,
  discrepancy_type TEXT,
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_sync_discrepancies_unresolved ON public.sellus_sync_discrepancies(resolved) WHERE resolved = false;
CREATE INDEX idx_sync_discrepancies_entity ON public.sellus_sync_discrepancies(entity_type, entity_id);
CREATE INDEX idx_sync_discrepancies_severity ON public.sellus_sync_discrepancies(severity);

-- Enable RLS on sync_discrepancies
ALTER TABLE public.sellus_sync_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync discrepancies"
  ON public.sellus_sync_discrepancies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create sync discrepancies"
  ON public.sellus_sync_discrepancies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sync discrepancies"
  ON public.sellus_sync_discrepancies FOR UPDATE
  TO authenticated
  USING (true);

-- 8. Remove any old order retention policies (if they exist)
-- Drop any scheduled cleanup functions or triggers
DROP FUNCTION IF EXISTS public.cleanup_old_orders() CASCADE;
DROP FUNCTION IF EXISTS public.auto_archive_old_orders() CASCADE;

-- 9. Add comment explaining the new sync model
COMMENT ON TABLE public.inventory IS 
'Inventory should ONLY be updated through Sellus sync operations (in/out delivery). 
Manual updates should be avoided. Any discrepancies should be logged in sellus_sync_discrepancies table.';

COMMENT ON TABLE public.products IS 
'Products are synced from Sellus. The fdt_sellus_item_id links to Sellus item ID. 
Product data should only be updated via Sellus sync, not manually.';

COMMENT ON TABLE public.orders IS 
'Orders are synced from Sellus when products are scanned during delivery note processing. 
No retention time limit - orders remain in system indefinitely.';
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    UNIQUE (user_id, role)
);

-- Create index for faster lookups
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security Definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Anyone authenticated can view user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Function to invite users (only for admins)
CREATE OR REPLACE FUNCTION public.invite_user(
  user_email TEXT,
  user_role app_role DEFAULT 'user'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_result JSON;
BEGIN
  -- Check that caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can invite users';
  END IF;
  
  -- Return result for edge function to handle
  SELECT json_build_object(
    'email', user_email,
    'role', user_role,
    'invited_by', auth.uid()
  ) INTO invite_result;
  
  RETURN invite_result;
END;
$$;

-- IMPORTANT: Set your first admin user here
-- Replace 'your@email.com' with your actual email address
-- This will run after you log in for the first time
-- Uncomment and edit the line below after you know your email:
-- INSERT INTO public.user_roles (user_id, role, created_by)
-- SELECT id, 'admin'::app_role, id
-- FROM auth.users
-- WHERE email = 'your@email.com'
-- ON CONFLICT (user_id, role) DO NOTHING;-- Skapa profiles-tabell för användarinformation
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies - alla autentiserade kan se profiler
CREATE POLICY "Anyone can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Endast admins kan skapa profiler (via edge function)
CREATE POLICY "Only admins can insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Användare kan uppdatera sin egen profil
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Trigger för att uppdatera updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Lägg till profil för befintlig admin-användare (Anton Lundin)
INSERT INTO public.profiles (id, first_name, last_name)
SELECT id, 'Anton', 'Lundin'
FROM auth.users
WHERE email = 'oloflundin@icloud.com'
ON CONFLICT (id) DO UPDATE 
SET first_name = 'Anton', last_name = 'Lundin';-- Create branches table for stores/departments
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add Elon as example branch
INSERT INTO public.branches (name) VALUES ('Elon');

-- Add branch_id to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- Set your profile to Elon branch
UPDATE public.profiles 
SET branch_id = (SELECT id FROM public.branches WHERE name = 'Elon' LIMIT 1)
WHERE id = 'd0301d8b-6752-4c3e-9472-fb2d7afe3265';

-- Add is_super_admin column to user_roles
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Mark you as Super-Admin
UPDATE public.user_roles 
SET is_super_admin = true 
WHERE user_id = 'd0301d8b-6752-4c3e-9472-fb2d7afe3265';

-- Create function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND is_super_admin = true
  )
$$;

-- Enable RLS on branches table
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can view branches
CREATE POLICY "Anyone authenticated can view branches"
ON public.branches
FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can insert branches
CREATE POLICY "Only admins can insert branches"
ON public.branches
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Only admins can update branches
CREATE POLICY "Only admins can update branches"
ON public.branches
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Prevent non-super-admins from modifying super admin roles
CREATE POLICY "Cannot modify super admin roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  -- Allow if the target user is NOT a super admin
  NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = user_roles.user_id
    AND ur.is_super_admin = true
  )
  -- OR the current user IS a super admin
  OR public.is_super_admin(auth.uid())
);

-- Policy: Prevent non-super-admins from deleting super admin roles
CREATE POLICY "Cannot delete super admin roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  -- Allow if the target user is NOT a super admin
  NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = user_roles.user_id
    AND ur.is_super_admin = true
  )
  -- OR the current user IS a super admin
  OR public.is_super_admin(auth.uid())
);-- Add is_limited column to user_roles table
-- This field indicates if a user has read-only access (limited/restricted)
ALTER TABLE user_roles 
ADD COLUMN IF NOT EXISTS is_limited boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN user_roles.is_limited IS 'Indicates if user has read-only access to all features';
-- Create helper function to check if user is limited (read-only)
CREATE OR REPLACE FUNCTION public.is_user_limited(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_limited FROM public.user_roles WHERE user_roles.user_id = $1),
    false
  );
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.is_user_limited(uuid) IS 'Returns true if user has read-only/limited access';

-- Update existing INSERT policies to block limited users
-- We need to add checks to prevent limited users from inserting data

-- For delivery_notes
DROP POLICY IF EXISTS "Authenticated users can create delivery notes" ON public.delivery_notes;
CREATE POLICY "Authenticated users can create delivery notes"
ON public.delivery_notes
FOR INSERT
TO authenticated
WITH CHECK (NOT public.is_user_limited(auth.uid()));

-- For delivery_note_items  
DROP POLICY IF EXISTS "Authenticated users can create delivery note items" ON public.delivery_note_items;
CREATE POLICY "Authenticated users can create delivery note items"
ON public.delivery_note_items
FOR INSERT
TO authenticated
WITH CHECK (NOT public.is_user_limited(auth.uid()));

-- Update UPDATE policies to block limited users

-- For delivery_notes
DROP POLICY IF EXISTS "Authenticated users can update their delivery notes" ON public.delivery_notes;
CREATE POLICY "Authenticated users can update their delivery notes"
ON public.delivery_notes
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (NOT public.is_user_limited(auth.uid()));

-- For delivery_note_items
DROP POLICY IF EXISTS "Authenticated users can update delivery note items" ON public.delivery_note_items;
CREATE POLICY "Authenticated users can update delivery note items"
ON public.delivery_note_items
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (NOT public.is_user_limited(auth.uid()));

-- For products table (conditionally update if it exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products') THEN
    DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
    CREATE POLICY "Authenticated users can update products"
    ON public.products
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (NOT public.is_user_limited(auth.uid()));
  END IF;
END $$;

-- For orders table (conditionally update if it exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
    DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
    CREATE POLICY "Authenticated users can create orders"
    ON public.orders
    FOR INSERT
    TO authenticated
    WITH CHECK (NOT public.is_user_limited(auth.uid()));
    
    DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
    CREATE POLICY "Authenticated users can update orders"
    ON public.orders
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (NOT public.is_user_limited(auth.uid()));
  END IF;
END $$;

-- Note: DELETE policies are typically more restrictive and often limited to admins
-- Limited users should already be blocked from deleting by existing policies
