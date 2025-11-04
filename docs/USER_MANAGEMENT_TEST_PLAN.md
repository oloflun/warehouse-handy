# User Management Test Plan

## Overview
This document outlines the test plan for the User Management UI/UX and Functionality Overhaul.

## Test Environment Setup
1. Ensure Supabase is configured with SMTP for email testing (see EMAIL_CONFIGURATION.md)
2. Create test users with different roles:
   - Super Admin user
   - Regular Admin user
   - Regular User
   - Limited/Read-only User
3. Have a test email account ready to receive invitation emails

## Feature Tests

### 1. User Profile Display (ProfileInfoCard)

#### Test 1.1: User Name and Branch Display
**Steps:**
1. Log in as a user with a branch assigned
2. Navigate to User Management page
3. Observe the profile card

**Expected Results:**
- User name displays as "FirstName LastName"
- Branch name appears after the user name (e.g., "John Doe - Stockholm")
- Admin badge appears next to name (not after branch)
- Badge shows "Admin" or "Super-Admin" based on role
- Email displays below the name

#### Test 1.2: Change Password Functionality
**Steps:**
1. Log in as any user
2. Navigate to User Management page
3. Click "Ändra lösenord" button
4. Enter invalid current password and click "Ändra lösenord"
5. Observe error message
6. Enter correct current password and valid new password
7. Click "Ändra lösenord"

**Expected Results:**
- Password change form appears with two fields side-by-side
- Error shows "Felaktigt nuvarande lösenord" for wrong current password
- Success message shows "Lösenordet har ändrats" for valid change
- Form closes after successful change
- Can log in with new password

### 2. User Invitation and Activation

#### Test 2.1: Admin User Invitation
**Steps:**
1. Log in as admin
2. Navigate to User Management page
3. Click "Lägg till användare"
4. Fill in all required fields (first name, last name, email, role, branch)
5. Click "Bjud in"

**Expected Results:**
- Success message shows with note about activation email
- User appears in user list with "Väntande" (Pending) badge
- Invitation email is sent to the provided email address
- Email contains activation link

#### Test 2.2: User Activation
**Steps:**
1. Check email inbox for invitation
2. Click activation link in email
3. Set password and complete registration
4. Log in with new credentials

**Expected Results:**
- Activation page loads successfully
- Can set password and complete registration
- Can log in with new credentials
- "Väntande" badge disappears from user list
- User shows as active in user list

### 3. User List and Actions

#### Test 3.1: User List Display
**Steps:**
1. Log in as admin
2. Navigate to User Management page
3. Observe the user list

**Expected Results:**
- All users except Super Admin are visible
- Each user row shows:
  - Name with branch (e.g., "John Doe - Stockholm")
  - Admin badge if applicable
  - "Väntande" badge for pending users
  - "Begränsad" badge for limited users
  - Email address
  - Role (Admin/Användare)
  - Branch name
  - Creation date
  - Actions menu (three dots)

#### Test 3.2: Reset Password Action
**Steps:**
1. Log in as admin
2. Navigate to User Management page
3. Click actions menu (three dots) for a user
4. Click "Återställ lösenord"
5. Confirm the action

**Expected Results:**
- Confirmation dialog appears
- Success message shows after confirmation
- Password reset email is sent to user

#### Test 3.3: Change User Role
**Steps:**
1. Log in as admin
2. Click actions menu for a regular user
3. Click "Ändra roll"
4. Change role and branch
5. Click "Uppdatera"

**Expected Results:**
- Edit dialog opens with current user data
- Can modify role and branch
- Success message shows after update
- User list updates to reflect changes

#### Test 3.4: Limit User (Set Read-Only)
**Steps:**
1. Log in as admin
2. Click actions menu for a regular user
3. Click "Begränsa användare"
4. Log out and log in as the limited user
5. Try to modify any data (create/update delivery notes, products, etc.)

**Expected Results:**
- Success message shows user is now limited
- "Begränsad" badge appears on user in list
- Limited user can view all data
- Limited user cannot create or modify any data
- Database policies prevent any write operations

#### Test 3.5: Remove Limited Status
**Steps:**
1. Log in as admin
2. Click actions menu for a limited user
3. Click "Ge full åtkomst"

**Expected Results:**
- Success message shows user has full access
- "Begränsad" badge disappears
- User can now create and modify data

#### Test 3.6: Delete User
**Steps:**
1. Log in as admin
2. Click actions menu for a user
3. Click "Ta bort"
4. Confirm deletion

**Expected Results:**
- Confirmation dialog appears
- Success message shows after deletion
- User is removed from the list
- User can no longer log in

### 4. Admin Permission Hierarchy

#### Test 4.1: Regular Admin Cannot Modify Other Admins
**Steps:**
1. Log in as regular admin (not super admin)
2. Navigate to User Management page
3. Observe actions menu for another admin user

**Expected Results:**
- Can see "Återställ lösenord" option
- Cannot see "Ändra roll", "Begränsa användare", or "Ta bort" options
- Actions are disabled/hidden for admin users

#### Test 4.2: Super Admin Can Modify All Users
**Steps:**
1. Log in as super admin
2. Navigate to User Management page
3. Observe actions menu for admin users

**Expected Results:**
- All action options are available
- Can modify admin users' roles
- Can limit admin users
- Can delete admin users

#### Test 4.3: Super Admin Not Visible in List
**Steps:**
1. Log in as regular admin
2. Navigate to User Management page
3. Check user list

**Expected Results:**
- Super admin users are not visible in the list
- Only regular admins and users are shown
- Total user count excludes super admins

### 5. Edge Cases and Error Handling

#### Test 5.1: Invite Existing Email
**Steps:**
1. Try to invite a user with an email that's already registered

**Expected Results:**
- Appropriate error message is shown
- User is not added to the list

#### Test 5.2: Network Error During Operations
**Steps:**
1. Simulate network disconnection
2. Try to perform user operations

**Expected Results:**
- Error messages are displayed
- Operations fail gracefully
- No data corruption

#### Test 5.3: Concurrent User Modifications
**Steps:**
1. Open user management in two browser tabs
2. Modify same user in both tabs
3. Observe behavior

**Expected Results:**
- Last update wins
- User list refreshes to show current state
- No data loss

## Security Tests

### Test 6.1: Non-Admin Access
**Steps:**
1. Log in as regular (non-admin) user
2. Try to access /user-management URL directly

**Expected Results:**
- Access denied message shown
- Cannot view user management page
- Redirected to home or shown error

### Test 6.2: Limited User Write Operations
**Steps:**
1. Log in as limited user
2. Try to create/update data via:
   - UI forms
   - Direct API calls (if possible)
   - Browser console

**Expected Results:**
- All write operations fail
- Database policies block modifications
- Appropriate error messages shown

### Test 6.3: API Endpoint Security
**Steps:**
1. Try to call user management functions without authentication
2. Try to call functions as regular user
3. Try to modify super admin as regular admin

**Expected Results:**
- Unauthorized requests are rejected
- Permission checks prevent unauthorized actions
- Super admins remain protected

## Browser Compatibility
Test all features in:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Mobile Responsiveness
Test on:
- Mobile phone (portrait/landscape)
- Tablet (portrait/landscape)

Expected: All features work and display correctly

## Performance Tests
- User list pagination works smoothly with 100+ users
- Search/filter operations are responsive
- No memory leaks during extended use

## Acceptance Criteria Checklist
- [ ] User name and branch display correctly formatted
- [ ] Admin badge appears next to name (not after branch)
- [ ] Change password functionality works
- [ ] User invitations send activation emails
- [ ] Pending users show "Väntande" badge
- [ ] Limited users show "Begränsad" badge
- [ ] All user actions available in menu
- [ ] Regular admins cannot modify other admins
- [ ] Super admins hidden from list
- [ ] Super admins can modify all users
- [ ] Limited users cannot modify any data
- [ ] Database policies enforce read-only restrictions
- [ ] Email configuration documented
- [ ] All operations logged appropriately
