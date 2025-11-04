# User Management Overhaul - Changes Summary

## Overview
Complete overhaul of the user management system with improved UI/UX, enhanced functionality, and proper permission hierarchy.

## Key Changes

### 1. User Profile Display Improvements

#### ProfileInfoCard Component
**File:** `src/components/ProfileInfoCard.tsx`

**Changes:**
- **Branch Display**: Branch name now appears after user name (e.g., "John Doe - Stockholm") instead of on a separate line
- **Admin Badge**: Admin/Super-Admin badge displays next to the name, not after "Admin" text
- **Change Password Feature**: 
  - New "Ändra lösenord" button at bottom right of profile card
  - Expandable form with two side-by-side fields:
    - Current password (left)
    - New password (right)
  - Validates current password before allowing change
  - Password updated immediately on submission
  - Form closes after successful change

### 2. User List Enhancements

#### UserManagementTable Component
**File:** `src/components/UserManagementTable.tsx`

**Display Changes:**
- Branch name shown after user name in table (consistent with profile card)
- Admin badge appears next to name
- New badges:
  - **"Väntande"** (yellow): Shows for invited users who haven't activated yet
  - **"Begränsad"** (gray): Shows for read-only/limited users

**Action Menu:**
Enhanced dropdown menu for each user with:
1. **Återställ lösenord** - Send password recovery link (available to all admins)
2. **Ändra roll** - Change user role and branch (restricted by permissions)
3. **Begränsa användare / Ge full åtkomst** - Toggle read-only status
4. **Ta bort** - Remove user from system

**Permission Controls:**
- Regular admins cannot modify other admin users
- Only super admins can edit/limit/delete admin users
- Actions are hidden/disabled based on current user's permissions

### 3. Admin Permission Hierarchy

**Super Admin Features:**
- Can modify any user including other admins
- Hidden from the user list (for security)
- Has access to all user management functions

**Regular Admin Restrictions:**
- Cannot change roles of other admins
- Cannot limit other admins
- Cannot delete other admins
- Can only send password reset links to admins

**Implementation:**
- Permission checks in `UserManagementTable.canModifyUser()`
- Server-side validation in edge functions
- Filters super admins from list display

### 4. Read-Only User Functionality

**New Feature: Limited Users**
Users can now be set to read-only mode where they can:
- ✅ View all data
- ❌ Cannot create new records
- ❌ Cannot modify existing records
- ❌ Cannot delete records

**Database Schema:**
- New column: `user_roles.is_limited` (boolean, default: false)
- Migration: `20251104131516_add_is_limited_to_user_roles.sql`

**Database Policies:**
- New helper function: `public.is_user_limited(user_id)`
- Updated RLS policies on:
  - `delivery_notes`
  - `delivery_note_items`
  - `products`
  - `orders`
- Migration: `20251104132000_add_is_limited_helper_and_policies.sql`

**Edge Function:**
- New function: `toggle-user-limited`
- Validates admin permissions
- Prevents regular admins from limiting other admins
- Updates `is_limited` flag in user_roles table

### 5. User Invitation Improvements

**Enhanced Error Handling:**
- Better logging in `invite-user` function
- Detailed error messages
- SMTP configuration hints in response

**Pending Status:**
- Users show as "Väntande" until they activate their account
- Status checked via `email_confirmed_at` and `last_sign_in_at`
- Automatically updates when user completes registration

**list-users Function Updates:**
- Now includes `is_pending` flag
- Includes `is_limited` flag
- Filters out super admin users
- Returns complete user information with roles and branches

### 6. Email Configuration

**Documentation Created:**
`docs/EMAIL_CONFIGURATION.md` includes:
- Complete SMTP setup guide
- Provider recommendations (SendGrid, SES, Mailgun, etc.)
- Email template customization
- Troubleshooting steps
- Development vs production setup
- Monitoring and logging

**Function Improvements:**
- Enhanced logging in `invite-user` function
- Better error messages
- Hints about SMTP configuration
- Success notifications include email sending confirmation

## File Changes Summary

### Frontend Components
1. `src/components/ProfileInfoCard.tsx` - Profile display and password change
2. `src/components/UserManagementTable.tsx` - User list with enhanced actions
3. `src/components/AddUserDialog.tsx` - Improved success messages
4. `src/pages/UserManagement.tsx` - Filter super admins, add toggle limited handler

### Backend Functions
1. `supabase/functions/invite-user/index.ts` - Enhanced logging and error handling
2. `supabase/functions/list-users/index.ts` - Added pending and limited status
3. `supabase/functions/toggle-user-limited/index.ts` - New function for read-only control

### Database Migrations
1. `20251104131516_add_is_limited_to_user_roles.sql` - Add is_limited column
2. `20251104132000_add_is_limited_helper_and_policies.sql` - RLS policies for read-only

### Type Definitions
1. `src/integrations/supabase/types.ts` - Added is_limited to user_roles type

### Documentation
1. `docs/EMAIL_CONFIGURATION.md` - Email setup guide
2. `docs/USER_MANAGEMENT_TEST_PLAN.md` - Comprehensive test plan
3. `docs/USER_MANAGEMENT_CHANGES.md` - This file

## Technical Details

### New Database Function
```sql
CREATE FUNCTION public.is_user_limited(user_id uuid)
RETURNS boolean
```
Returns true if user has read-only access, used in RLS policies.

### RLS Policy Pattern
All write operations now check:
```sql
WITH CHECK (NOT public.is_user_limited(auth.uid()))
```

### Permission Hierarchy Logic
```typescript
const canModifyUser = (user: User) => {
  if (user.id === currentUserId) return false;  // Can't modify self
  if (isSuperAdmin) return true;  // Super admin can modify anyone
  if (user.is_super_admin) return false;  // Can't modify super admins
  return true;  // Regular admin can modify regular users
};
```

## Migration Guide

### For Existing Installations
1. Run database migrations in order:
   - `20251104131516_add_is_limited_to_user_roles.sql`
   - `20251104132000_add_is_limited_helper_and_policies.sql`

2. Deploy new Supabase edge functions:
   - `toggle-user-limited`
   - Updated `invite-user`
   - Updated `list-users`

3. Configure SMTP in Supabase:
   - Follow `docs/EMAIL_CONFIGURATION.md`
   - Test with a test user invitation

4. Deploy frontend changes

5. Test according to `docs/USER_MANAGEMENT_TEST_PLAN.md`

## Breaking Changes
None. All changes are backward compatible.

## Security Improvements
1. Database-level enforcement of read-only restrictions
2. Server-side permission validation
3. Super admin protection (hidden and cannot be modified by regular admins)
4. Improved error handling prevents information disclosure

## Known Limitations
1. Email sending requires SMTP configuration in Supabase
2. Password change requires knowing current password
3. Super admin accounts must be created via Supabase dashboard
4. No self-service password reset for admins (must use email)

## Future Enhancements
- Add activity logging for user management actions
- Add bulk user operations
- Add user import/export functionality
- Add custom roles beyond admin/user
- Add fine-grained permissions per feature
