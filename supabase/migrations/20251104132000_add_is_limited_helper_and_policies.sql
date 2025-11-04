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

-- For products (if they exist and have UPDATE policies)
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
CREATE POLICY "Authenticated users can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (NOT public.is_user_limited(auth.uid()));

-- For orders (if they exist and have INSERT/UPDATE policies)
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

-- Note: DELETE policies are typically more restrictive and often limited to admins
-- Limited users should already be blocked from deleting by existing policies
