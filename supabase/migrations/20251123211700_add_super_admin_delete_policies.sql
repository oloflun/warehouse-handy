-- Ensure ONLY oloflundin@icloud.com is marked as super admin
UPDATE public.user_roles 
SET is_super_admin = false;

UPDATE public.user_roles 
SET is_super_admin = true 
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE email = 'oloflundin@icloud.com'
);

-- Add DELETE policies for Super Admins only

DROP POLICY IF EXISTS "Super admins can delete delivery notes" ON public.delivery_notes;
CREATE POLICY "Super admins can delete delivery notes"
  ON public.delivery_notes FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete delivery note items" ON public.delivery_note_items;
CREATE POLICY "Super admins can delete delivery note items"
  ON public.delivery_note_items FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete orders" ON public.orders;
CREATE POLICY "Super admins can delete orders"
  ON public.orders FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete order lines" ON public.order_lines;
CREATE POLICY "Super admins can delete order lines"
  ON public.order_lines FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete products" ON public.products;
CREATE POLICY "Super admins can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete inventory" ON public.inventory;
CREATE POLICY "Super admins can delete inventory"
  ON public.inventory FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));
