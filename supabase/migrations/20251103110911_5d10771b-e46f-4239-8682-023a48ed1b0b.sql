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
-- ON CONFLICT (user_id, role) DO NOTHING;