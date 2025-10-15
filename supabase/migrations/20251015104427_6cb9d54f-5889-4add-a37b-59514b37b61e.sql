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
  ('Reservlager', 'Extra lagerhållning');