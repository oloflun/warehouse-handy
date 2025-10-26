-- Create table for tracking Sellus sync failures
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
  USING (true);