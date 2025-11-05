# Security Guide

This document explains the security model of the Warehouse Handy application and how to handle sensitive credentials properly.

## ⚠️ CRITICAL: API Keys Security

### Understanding Supabase Keys

Supabase provides two types of API keys with **very different security implications**:

#### 1. `anon` (Public) Key - SAFE to Expose ✅

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Ymx6amV5eGZheGlla2FjZm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjE4ODQsImV4cCI6MjA3NzgzNzg4NH0._vwVJb2Z8YGvng1yynO6HzMf3_rwydeuULukhsRcvY0
```

**Why it's safe:**
- ✅ Designed to be used in frontend/browser code
- ✅ Has `anon` role with **limited permissions**
- ✅ Respects Row Level Security (RLS) policies
- ✅ Cannot bypass database security
- ✅ Used by millions of apps publicly

**Current usage in this app:**
- Stored in `.env` as `VITE_SUPABASE_PUBLISHABLE_KEY`
- Used in `src/integrations/supabase/client.ts`
- Bundled in frontend JavaScript (visible in browser)

**Protection mechanism:**
- All database access is protected by RLS policies
- Users can only access data they're authorized to see
- Database operations are validated server-side

#### 2. `service_role` Key - 🚨 NEVER EXPOSE 🚨

```
⚠️ THIS KEY MUST NEVER BE IN FRONTEND CODE OR COMMITTED TO GIT
```

**Why it's dangerous:**
- ❌ Bypasses ALL Row Level Security policies
- ❌ Has complete database access
- ❌ Can read/write/delete ANY data
- ❌ Can access admin functions
- ❌ Cannot be revoked without creating new project

**Where it should be used:**
- ✅ Backend Edge Functions only
- ✅ Server-side scripts only
- ✅ CI/CD pipelines (as secrets)
- ✅ Local scripts (in .env, not committed)

**Never use in:**
- ❌ Frontend code
- ❌ Git repository
- ❌ Client-side JavaScript
- ❌ Mobile apps
- ❌ Publicly accessible locations

## Current Configuration

### Frontend (.env file) - Safe ✅

```env
VITE_SUPABASE_PROJECT_ID="sublzjeyxfaxiekacfme"
VITE_SUPABASE_PUBLISHABLE_KEY="[anon key - safe to expose]"
VITE_SUPABASE_URL="https://sublzjeyxfaxiekacfme.supabase.co"
```

**Note:** Variables prefixed with `VITE_` are bundled into the frontend and are visible in the browser. This is **intentional and safe** for the `anon` key.

### Backend (Edge Functions) - Secrets Required 🔒

Edge Functions that need elevated privileges should use:

```typescript
// Access service_role key from environment
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)
```

**Setting Edge Function secrets:**
```bash
# Never commit this key!
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="[your-service-role-key]" --project-ref sublzjeyxfaxiekacfme
```

## Security Best Practices

### 1. Git Repository Security

**Files that are safe to commit:**
- ✅ `.env.example` (with placeholder values)
- ✅ Documentation mentioning the anon key
- ✅ Public API URLs
- ✅ Project IDs

**Files that must NEVER be committed:**
- ❌ `.env` (actual file with any keys)
- ❌ `service_role` key anywhere
- ❌ Database passwords
- ❌ SMTP passwords
- ❌ API keys from other services

**Current protection:**
```gitignore
# .gitignore
.env
.env.local
.env*.local
backups/
*.sql
```

### 2. Row Level Security (RLS)

The application uses RLS policies to secure all data:

```sql
-- Example: Users can only read products
CREATE POLICY "Authenticated users can read products"
ON public.products FOR SELECT
TO authenticated
USING (true);

-- Example: Limited users cannot modify data
CREATE POLICY "Non-limited users can update products"
ON public.products FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (NOT public.is_user_limited(auth.uid()));
```

**All tables have RLS enabled:**
- `products`
- `inventory`
- `orders`
- `delivery_notes`
- `user_roles`
- And all other tables

### 3. Authentication Security

**User authentication:**
- Handled by Supabase Auth
- Passwords never stored in app code
- JWT tokens used for session management
- Tokens automatically refresh

**Password requirements:**
- Configured in Supabase Dashboard
- Recommended: Minimum 8 characters, mix of characters
- Can enable 2FA for admin users

### 4. Edge Function Security

**Secure patterns:**

```typescript
// ✅ GOOD: Verify JWT token
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Get auth token from request
  const authHeader = req.headers.get('Authorization')!
  
  // Create client with user's token
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  
  // Get current user - this validates the JWT
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  // Now perform operations as this user
  // RLS policies will be enforced
})
```

**Insecure patterns to avoid:**

```typescript
// ❌ BAD: Don't use service_role for user operations
// ❌ BAD: Don't bypass RLS for user-facing features
// ❌ BAD: Don't trust client-provided user IDs without verification
```

### 5. Environment Variables

**Development (.env):**
```env
# Local development only - never commit
VITE_SUPABASE_PROJECT_ID="sublzjeyxfaxiekacfme"
VITE_SUPABASE_PUBLISHABLE_KEY="[anon-key]"
VITE_SUPABASE_URL="https://sublzjeyxfaxiekacfme.supabase.co"
```

**Production (hosting platform):**
- Set in Vercel/Netlify environment variables
- Not committed to Git
- Different for staging/production if needed

**Edge Functions (Supabase secrets):**
```bash
# Set secrets for Edge Functions
supabase secrets set SECRET_NAME="value" --project-ref sublzjeyxfaxiekacfme

# List secrets (values hidden)
supabase secrets list --project-ref sublzjeyxfaxiekacfme
```

## Security Checklist

### Before Deploying to Production

- [ ] Verify `.env` is in `.gitignore`
- [ ] Confirm no service_role keys in code
- [ ] Check all RLS policies are enabled
- [ ] Review Edge Function authentication
- [ ] Set up secure SMTP credentials
- [ ] Configure CORS settings in Supabase
- [ ] Enable 2FA for admin accounts
- [ ] Review audit logs regularly
- [ ] Set up monitoring and alerts
- [ ] Document security procedures
- [ ] Train team on security practices

### Regular Security Maintenance

- [ ] Review RLS policies quarterly
- [ ] Audit user permissions monthly
- [ ] Check for security updates weekly
- [ ] Monitor failed authentication attempts
- [ ] Review Edge Function logs
- [ ] Rotate service_role key annually
- [ ] Update dependencies regularly
- [ ] Scan for vulnerabilities (npm audit)

## Common Security Questions

### Q: Why is the anon key in the frontend if keys should be secret?

**A:** The `anon` key is **designed** to be public. It's like a username - not secret. The security comes from:
1. Row Level Security policies that check user authentication
2. JWT tokens that verify user identity
3. Database-level permissions that limit what the `anon` role can do

### Q: Can someone steal my data with the anon key?

**A:** No, because:
1. RLS policies restrict data access based on authenticated user
2. The `anon` key alone cannot bypass security
3. All operations are validated server-side
4. Supabase validates JWT tokens on every request

### Q: What if someone finds my service_role key?

**A:** This is serious. Immediately:
1. Revoke the key in Supabase Dashboard
2. Generate a new project (if key cannot be rotated)
3. Audit all data for unauthorized changes
4. Review access logs
5. Notify affected users if data was compromised

### Q: Should I use environment variables for everything?

**A:** Yes for credentials, no for public config:
- ✅ Use env vars: API keys, passwords, secrets
- ❌ Don't need env vars: Public URLs, feature flags, non-sensitive config

### Q: Is it safe to commit the anon key in documentation?

**A:** While technically safe (it's public anyway), it's better to:
1. Use `[your-anon-key]` placeholders in docs
2. Store actual key in `.env.example` as a template
3. Users get their own key from Supabase Dashboard

## Incident Response

### If Security Breach Suspected

1. **Immediate Actions:**
   - Disable compromised credentials
   - Block suspicious IP addresses
   - Enable additional logging
   - Preserve evidence (logs, screenshots)

2. **Investigation:**
   - Review Supabase audit logs
   - Check for unauthorized data access
   - Identify scope of breach
   - Document timeline of events

3. **Remediation:**
   - Rotate all affected credentials
   - Patch security vulnerabilities
   - Update RLS policies if needed
   - Deploy security fixes

4. **Communication:**
   - Notify affected users
   - Report to authorities if required
   - Document lessons learned
   - Update security procedures

### Contact

**Security Issues:**
- Email: oloflundin@icloud.com
- Mark as "SECURITY" in subject line
- Include detailed information
- Do not disclose publicly until patched

## Resources

### Official Documentation
- [Supabase Security Guide](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Edge Functions Security](https://supabase.com/docs/guides/functions)

### Security Tools
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit) - Check for vulnerable dependencies
- [Supabase Dashboard](https://supabase.com/dashboard) - Monitor auth attempts
- [CodeQL](https://codeql.github.com/) - Automated code scanning

### Best Practices
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Web Security Basics](https://developer.mozilla.org/en-US/docs/Web/Security)

---

## Summary

### ✅ Safe to Expose (anon key)
- Public API key designed for frontend use
- Protected by Row Level Security
- Cannot bypass database security
- Used in browser JavaScript

### 🚨 Never Expose (service_role key)
- Admin key that bypasses all security
- Server-side use only
- Must be kept secret
- Can access all data

### 🔒 Current Status
- ✅ Anon key properly configured
- ✅ .env file gitignored
- ✅ RLS policies enabled
- ✅ Edge Functions secured
- ✅ No service_role keys in code
- ✅ Documentation updated

**The application follows Supabase security best practices and is safe for production use.**

---

*Last updated: November 5, 2024*
*Security version: 1.0*
