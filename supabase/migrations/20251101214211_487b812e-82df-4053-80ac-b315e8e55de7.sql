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
  USING (true);