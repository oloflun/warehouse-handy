-- Restore admin role and super-admin status for oloflundin@icloud.com (oloflun)
-- This fixes the issue where admin permissions were lost after migration

-- First, verify the user exists in auth.users
DO $$
DECLARE
  user_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE email = 'oloflundin@icloud.com') 
  INTO user_exists;
  
  IF NOT user_exists THEN
    RAISE EXCEPTION 'User oloflundin@icloud.com does not exist in auth.users table';
  END IF;
END $$;

-- Ensure the user has the admin role in user_roles table
-- Using ON CONFLICT to make this migration idempotent and safe to re-run
-- Note: 'admin' is a valid value in the app_role enum (defined in migration 20251103110911)
INSERT INTO public.user_roles (user_id, role, created_by, is_super_admin)
SELECT 
  id,
  'admin'::app_role,  -- Cast to app_role enum for type safety
  id,  -- created_by is self
  true -- is_super_admin
FROM auth.users
WHERE email = 'oloflundin@icloud.com'
ON CONFLICT (user_id, role) 
DO UPDATE SET 
  is_super_admin = true;

-- Verify and log the change (this will show in migration output)
DO $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count
  FROM public.user_roles ur
  JOIN auth.users u ON ur.user_id = u.id
  WHERE u.email = 'oloflundin@icloud.com'
    AND ur.role = 'admin'
    AND ur.is_super_admin = true;
  
  IF user_count = 0 THEN
    RAISE EXCEPTION 'Failed to restore admin role and super-admin status for oloflundin@icloud.com';
  ELSE
    RAISE NOTICE 'Successfully restored admin role and super-admin status for oloflundin@icloud.com';
  END IF;
END $$;
