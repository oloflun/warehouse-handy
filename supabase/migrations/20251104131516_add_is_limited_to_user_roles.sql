-- Add is_limited column to user_roles table
-- This field indicates if a user has read-only access (limited/restricted)
ALTER TABLE user_roles 
ADD COLUMN IF NOT EXISTS is_limited boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN user_roles.is_limited IS 'Indicates if user has read-only access to all features';
