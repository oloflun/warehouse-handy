-- Create branches table for stores/departments
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
);