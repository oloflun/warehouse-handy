# Email Configuration for User Invitations

## Overview
The user invitation feature uses Supabase's built-in email functionality to send activation emails to newly invited users. For emails to be sent successfully, Supabase must be configured with a proper SMTP server.

## Configuration Steps

### 1. Supabase Dashboard Configuration
To configure email sending in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Configure SMTP settings under **SMTP Settings**

### 2. SMTP Provider Options
You can use various SMTP providers:

- **SendGrid** (Recommended for production)
- **Amazon SES** (Good for high volume)
- **Mailgun**
- **Gmail** (For development/testing only)
- **Custom SMTP server**

### 3. Required SMTP Settings
Configure the following in Supabase:

- **SMTP Host**: Your email provider's SMTP server (e.g., `smtp.sendgrid.net`)
- **SMTP Port**: Usually `587` (TLS) or `465` (SSL)
- **SMTP User**: Your SMTP username
- **SMTP Password**: Your SMTP password or API key
- **Sender Email**: The email address that appears as the sender
- **Sender Name**: The name that appears as the sender

### 4. Email Template Customization
In Supabase Authentication → Email Templates, customize the **Invite User** template:

```html
<h2>You've been invited to join {{ .SiteURL }}</h2>
<p>Follow this link to accept the invite:</p>
<p><a href="{{ .ConfirmationURL }}">Accept the invite</a></p>
```

### 5. Testing Email Configuration
After configuration:

1. Invite a test user through the application
2. Check the user's email inbox (and spam folder)
3. Verify the activation link works
4. Check Supabase logs for any email sending errors

## Development vs Production

### Development
For local development, you can:
- Use the Supabase local development email capture (emails are logged, not sent)
- Configure a test SMTP account
- Use services like Mailtrap.io for email testing

### Production
For production:
- Use a reliable SMTP provider with high deliverability
- Configure proper SPF, DKIM, and DMARC records for your domain
- Monitor email delivery rates
- Set up proper error handling and logging

## Troubleshooting

### Emails Not Received
1. Check SMTP configuration in Supabase dashboard
2. Verify SMTP credentials are correct
3. Check Supabase function logs for errors
4. Verify email isn't in spam folder
5. Check domain reputation and email authentication records

### Common Issues
- **SMTP Authentication Failed**: Verify username/password
- **Connection Timeout**: Check firewall rules and port settings
- **Emails Going to Spam**: Configure SPF/DKIM/DMARC records
- **Rate Limiting**: Check your SMTP provider's sending limits

## Monitoring
The `invite-user` function includes enhanced logging:
- Logs when an invitation attempt starts
- Logs any invitation errors with details
- Logs successful invitations

Check Supabase function logs to monitor email sending:
```
Supabase Dashboard → Edge Functions → invite-user → Logs
```

## User Status
Users invited but not yet activated will show as **"Väntande"** (Pending) in the user list with a yellow badge. This status is automatically updated once the user clicks the activation link and completes registration.
