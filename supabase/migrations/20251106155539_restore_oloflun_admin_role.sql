-- Restore admin role and super-admin status for oloflundin@icloud.com (oloflun)
-- This fixes the issue where admin permissions were lost after migration

-- Ensure the user has the admin role in user_roles table
-- Using ON CONFLICT to make this migration idempotent and safe to re-run
INSERT INTO public.user_roles (user_id, role, created_by, is_super_admin)
SELECT 
  id,
  'admin'::app_role,
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
    RAISE WARNING 'User oloflundin@icloud.com not found or admin role not properly set';
  ELSE
    RAISE NOTICE 'Successfully restored admin role and super-admin status for oloflundin@icloud.com';
  END IF;
END $$;
