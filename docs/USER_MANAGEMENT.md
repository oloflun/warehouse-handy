# User Management & Email Configuration

## Overview

This document explains how user invitation and activation works in the Warehouse Handy application, and provides guidance on email configuration.

## User Invitation Flow

### How It Works

1. **Admin invites a user** via the User Management interface
   - Admin fills in: First Name, Last Name, Email, Role, and Branch (optional)
   - System calls the `invite-user` edge function

2. **System creates user records**
   - User is created in Supabase Auth with status "invited"
   - Profile record is created with first/last name and branch
   - User role is assigned (admin or user)

3. **Email is sent** (if configured properly)
   - Supabase sends an invitation email to the user
   - Email contains a link to activate their account

4. **User appears in list as "Väntande" (Pending)**
   - Until the user clicks the activation link and confirms their email
   - Status shows as "Väntande" (Pending) with yellow badge

5. **User activates account**
   - User clicks the link in the email
   - Sets their password
   - Status changes to "Aktiv" (Active) with green badge

## Email Configuration

### Important Note

For email invitations to work, **Supabase email must be properly configured** in your Supabase project settings.

### Steps to Configure Email in Supabase

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Configure Email Settings**
   - Go to: Authentication > Email Templates
   - Configure the "Invite user" template if needed

3. **Email Provider Options**

   **Option A: Use Supabase Built-in Email (Default)**
   - Works out of the box for development
   - Limited to 3 emails per hour on free tier
   - May be flagged as spam
   - Go to: Project Settings > Auth > Email Auth

   **Option B: Configure Custom SMTP (Recommended for Production)**
   - Go to: Project Settings > Auth > SMTP Settings
   - Enter your SMTP credentials (Gmail, SendGrid, Mailgun, etc.)
   - Test the connection
   - Benefits:
     - Higher sending limits
     - Better deliverability
     - Custom from address

4. **Verify Email Templates**
   - Go to: Authentication > Email Templates > Invite user
   - Ensure the template is enabled
   - Customize the message if needed
   - Make sure the redirect URL is correct

### Troubleshooting Email Issues

If invited users don't receive emails:

1. **Check Supabase Logs**
   - Go to: Logs > Edge Functions
   - Look for `invite-user` function calls
   - Check for any error messages

2. **Check Email Configuration**
   - Verify SMTP settings are correct (if using custom SMTP)
   - Test email sending from Supabase dashboard

3. **Check Spam Folder**
   - Invitation emails may end up in spam
   - Especially if using Supabase default email provider

4. **Rate Limits**
   - Free tier has email sending limits
   - Check if you've hit the limit

5. **Check User's Email**
   - Verify the email address is correct
   - Check if the email domain blocks automated emails

### Verifying Email Configuration

To test if emails are working:

1. Try inviting a test user with your own email
2. Check Supabase logs for the `invite-user` function
3. Check both inbox and spam folder
4. If no email arrives within 5 minutes, check configuration

## User Status Indicators

The user management interface shows:

- **Väntande (Pending)** - Yellow badge
  - User has been invited but hasn't confirmed email
  - Cannot log in yet
  
- **Aktiv (Active)** - Green badge
  - User has confirmed their email
  - Can log in and use the system

## Admin Functions

Admins can:
- ✅ View all users in the system
- ✅ Invite new users
- ✅ Edit user information (name, role, branch)
- ✅ Reset user passwords
- ✅ Delete users (except super admins)
- ✅ See which users are pending activation

Super Admins additionally can:
- ✅ Modify other admin accounts
- ✅ Delete admin accounts

## Technical Implementation

### Edge Functions

- **invite-user**: Creates new user and sends invitation email
- **list-users**: Retrieves all users with their status
- **update-user-profile**: Updates user information
- **reset-user-password**: Sends password reset email
- **delete-user**: Removes user from system

### Database Tables

- **user_roles**: Stores user roles (admin/user) and super admin flag
- **profiles**: Stores user profile information (first/last name, branch)
- **branches**: Stores branch/store information

### Key Fields

- `email_confirmed_at`: Timestamp when user confirmed email (null = pending)
- `is_pending`: Boolean flag (true = not yet confirmed)

## Support

For issues with user management or email configuration:
1. Check the troubleshooting section above
2. Review Supabase logs for errors
3. Verify email configuration in Supabase dashboard
4. Contact Supabase support for email delivery issues
