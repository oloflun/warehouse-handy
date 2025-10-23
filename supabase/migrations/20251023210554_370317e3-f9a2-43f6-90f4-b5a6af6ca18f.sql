-- Create orders table
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
  EXECUTE FUNCTION public.update_updated_at();