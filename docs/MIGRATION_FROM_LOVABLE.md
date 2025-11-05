# Migration Guide: From Lovable Cloud to Independent Deployment

This guide documents the migration of the Warehouse Handy application from Lovable Cloud to an independent deployment setup.

## Table of Contents
1. [Overview](#overview)
2. [What Changed](#what-changed)
3. [Pre-Migration Checklist](#pre-migration-checklist)
4. [Migration Steps](#migration-steps)
5. [Post-Migration Verification](#post-migration-verification)
6. [Rollback Plan](#rollback-plan)

## Overview

### Why Migrate?

Lovable Cloud is a great platform for rapid prototyping, but migrating to an independent deployment offers:

- ✅ **Full Control** - Complete control over deployment and infrastructure
- ✅ **Flexibility** - Choose any hosting provider (Vercel, Netlify, etc.)
- ✅ **Cost Optimization** - Many platforms offer generous free tiers
- ✅ **Custom Domains** - Easier custom domain configuration
- ✅ **CI/CD Integration** - Standard Git-based workflows
- ✅ **No Vendor Lock-in** - Not dependent on Lovable platform

### What Stays the Same?

- ✅ **Backend**: Supabase (already independent)
- ✅ **Database**: All data remains in Supabase
- ✅ **Edge Functions**: Already deployed to Supabase
- ✅ **Authentication**: Supabase Auth continues to work
- ✅ **Codebase**: All application logic remains unchanged

### What Changes?

- ❌ **Frontend Hosting**: Moved from Lovable to your chosen platform
- ❌ **Deployment Method**: Changed from Lovable UI to Git-based or CLI
- ❌ **Build Pipeline**: Removed Lovable-specific build tools
- ✅ **Dependencies**: Removed `lovable-tagger` package

## What Changed

### Code Changes

#### 1. `vite.config.ts`
```typescript
// BEFORE
import { componentTagger } from "lovable-tagger";
export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
}));

// AFTER
export default defineConfig(() => ({
  plugins: [react()],
}));
```

#### 2. `package.json`
```json
// REMOVED
"lovable-tagger": "^1.1.11"
```

#### 3. `README.md`
- Removed Lovable-specific deployment instructions
- Added deployment guides for Vercel, Netlify, and other platforms
- Added comprehensive project documentation

### New Files

#### Documentation
- `docs/DEPLOYMENT_GUIDE.md` - Complete deployment instructions
- `docs/BACKUP_AND_RESTORE.md` - Backup and disaster recovery
- `docs/DATABASE_SCHEMA.md` - Complete database documentation
- `docs/MIGRATION_FROM_LOVABLE.md` - This file

#### Deployment Configs
- `vercel.json` - Vercel deployment configuration
- `netlify.toml` - Netlify deployment configuration

#### Scripts
- `scripts/backup.sh` - Automated backup script

#### Updated Files
- `.gitignore` - Added backup file patterns

## Pre-Migration Checklist

### 1. Data Backup

Before starting the migration, create a complete backup:

```bash
# 1. Clone the repository (if not already done)
git clone https://github.com/oloflun/warehouse-handy.git
cd warehouse-handy

# 2. Create database backup (requires PostgreSQL tools)
# Get connection string from Supabase Dashboard → Settings → Database
pg_dump "postgresql://postgres:[PASSWORD]@db.sublzjeyxfaxiekacfme.supabase.co:5432/postgres" \
  > backup_pre_migration_$(date +%Y%m%d).sql

# Or use the backup script
./scripts/backup.sh
```

### 2. Document Current State

Record these details from Lovable:
- Current deployment URL: _______________
- Last known good deployment: _______________
- Environment variables used: _______________
- Custom domain (if any): _______________

### 3. Verify Supabase Configuration

Ensure Supabase is properly configured:
- [ ] Database is accessible
- [ ] All migrations are applied (29 migrations)
- [ ] All Edge Functions are deployed (18 functions)
- [ ] Authentication is configured
- [ ] Environment variables are documented

### 4. Choose New Hosting Platform

Select your hosting platform:
- [ ] Vercel (Recommended)
- [ ] Netlify
- [ ] Cloudflare Pages
- [ ] GitHub Pages
- [ ] AWS Amplify
- [ ] Other: _______________

### 5. Prepare Domain (if applicable)

If using a custom domain:
- [ ] Access to DNS settings
- [ ] SSL certificate plan (most platforms provide free SSL)
- [ ] DNS propagation time considered (24-48 hours)

## Migration Steps

### Step 1: Update Local Repository

```bash
# Pull latest changes (includes migration updates)
git pull origin main

# Verify Lovable dependencies are removed
grep -r "lovable" package.json vite.config.ts || echo "✓ Clean"

# Install dependencies
npm install

# Verify build works
npm run build
```

### Step 2: Set Up New Hosting Platform

#### Option A: Vercel (Recommended)

1. **Sign Up/Login**
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub

2. **Import Project**
   - Click "New Project"
   - Select `oloflun/warehouse-handy`
   - Vercel auto-detects Vite settings

3. **Configure Environment Variables**
   ```
   VITE_SUPABASE_PROJECT_ID=sublzjeyxfaxiekacfme
   VITE_SUPABASE_PUBLISHABLE_KEY=[from-supabase-dashboard]
   VITE_SUPABASE_URL=https://sublzjeyxfaxiekacfme.supabase.co
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - Note the deployment URL

#### Option B: Netlify

1. **Sign Up/Login**
   - Go to [netlify.com](https://netlify.com)
   - Sign up with GitHub

2. **Import Project**
   - "Add new site" → "Import an existing project"
   - Select `oloflun/warehouse-handy`

3. **Configure Build**
   - Build command: `npm run build`
   - Publish directory: `dist`

4. **Environment Variables**
   (Same as Vercel above)

5. **Deploy**
   - Click "Deploy site"
   - Note the deployment URL

#### Option C: Other Platforms

See `docs/DEPLOYMENT_GUIDE.md` for detailed instructions for:
- Cloudflare Pages
- GitHub Pages
- AWS Amplify

### Step 3: Update Supabase Configuration

1. **Update Redirect URLs**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select project `sublzjeyxfaxiekacfme`
   - Go to Authentication → URL Configuration
   - Add new deployment URL to "Redirect URLs"
   
   Example:
   ```
   https://warehouse-handy.vercel.app/**
   ```

2. **Update Site URL** (Optional)
   - Set "Site URL" to your new deployment URL
   - This affects password reset emails

3. **Test Authentication**
   - Try logging in with the new URL
   - Verify redirect works correctly

### Step 4: Test Deployment

Test these critical features on the new deployment:

#### Authentication
- [ ] Sign in with existing user
- [ ] Sign out
- [ ] Session persistence (refresh page while logged in)

#### Database Operations
- [ ] View products
- [ ] View inventory
- [ ] View delivery notes
- [ ] Create/edit data (if you have permissions)

#### Edge Functions
- [ ] User management functions work
- [ ] Sync functions execute
- [ ] Analysis functions respond

#### UI/UX
- [ ] All pages load correctly
- [ ] Navigation works
- [ ] Mobile view is responsive
- [ ] No console errors

### Step 5: Configure Custom Domain (Optional)

If you want to use a custom domain:

#### Vercel
1. Go to Project Settings → Domains
2. Add your domain (e.g., `warehouse.yourdomain.com`)
3. Update DNS records as instructed
4. Wait for SSL certificate provisioning

#### Netlify
1. Go to Domain Settings → Custom domains
2. Add your domain
3. Update DNS records
4. Wait for SSL certificate

### Step 6: Update Documentation

Update internal documentation with:
- New deployment URL
- New deployment process
- Any new environment-specific configurations

### Step 7: Notify Users (if applicable)

If users need to know:
- Send notification about URL change
- Update bookmarks/shortcuts
- Provide new URL

## Post-Migration Verification

### Smoke Tests

Run these tests on the new deployment:

1. **Authentication Flow**
   ```
   1. Navigate to new URL
   2. Log in with test credentials
   3. Navigate to different pages
   4. Log out
   5. Verify redirect to login page
   ```

2. **Data Operations**
   ```
   1. View product list
   2. Search for a product
   3. View inventory levels
   4. Check delivery notes
   5. Verify data is current
   ```

3. **Performance**
   ```
   1. Check page load times
   2. Verify images load correctly
   3. Test on mobile device
   4. Check different browsers
   ```

### Monitoring Setup

Set up monitoring for:
- [ ] Uptime monitoring (e.g., UptimeRobot)
- [ ] Error tracking (e.g., Sentry)
- [ ] Performance monitoring (built into Vercel/Netlify)
- [ ] Supabase usage metrics

### Backup Verification

Verify backup processes:
```bash
# Test backup script
./scripts/backup.sh

# Verify backup was created
ls -lh backups/

# Test extraction
cd backups/
tar -xzf warehouse_handy_backup_*.tar.gz
cat MANIFEST.txt
```

## Rollback Plan

If issues arise, you can rollback:

### Option 1: Keep Lovable Running (Temporary)

If Lovable deployment is still active:
1. Point users back to Lovable URL
2. Investigate issues with new deployment
3. Fix and redeploy

### Option 2: Deploy Previous Version

If you need to rollback code:

```bash
# Find last known good commit
git log --oneline

# Rollback to specific commit
git reset --hard [commit-hash]

# Force push (if already pushed)
git push -f origin main

# New deployment will auto-trigger
```

### Option 3: Restore from Backup

If data issues occur:

```bash
# Restore database from backup
psql "postgresql://postgres:[PASSWORD]@db.sublzjeyxfaxiekacfme.supabase.co:5432/postgres" \
  < backup_pre_migration_YYYYMMDD.sql
```

## Common Issues and Solutions

### Issue 1: Authentication Fails

**Symptoms:** Users can't log in, or get redirected to wrong page

**Solution:**
1. Check Supabase → Authentication → URL Configuration
2. Ensure redirect URLs include your new deployment URL
3. Clear browser cache and cookies
4. Try incognito mode

### Issue 2: Environment Variables Not Working

**Symptoms:** API calls fail, can't connect to Supabase

**Solution:**
1. Verify all variables start with `VITE_`
2. Check variable names match exactly
3. Redeploy after changing environment variables
4. Check browser console for errors

### Issue 3: Build Fails

**Symptoms:** Deployment fails during build

**Solution:**
```bash
# Clear cache and rebuild locally
rm -rf node_modules package-lock.json dist
npm install
npm run build

# Check for errors
# If successful locally, check platform logs
```

### Issue 4: 404 on Page Refresh

**Symptoms:** Direct navigation to routes shows 404

**Solution:**
- Ensure `vercel.json` or `netlify.toml` is present
- Check SPA routing is configured
- Verify rewrite rules are correct

### Issue 5: CORS Errors

**Symptoms:** API calls blocked by browser

**Solution:**
1. Add new URL to Supabase → Authentication → URL Configuration
2. Restart Edge Functions if needed
3. Check browser console for specific error

## Success Criteria

The migration is successful when:

- ✅ All users can access the application at the new URL
- ✅ Authentication works correctly
- ✅ All data is accessible and current
- ✅ Edge Functions execute properly
- ✅ No console errors in browser
- ✅ Mobile view works correctly
- ✅ Performance is acceptable (< 3s load time)
- ✅ Monitoring is set up
- ✅ Backups are configured
- ✅ Team is trained on new deployment process

## Next Steps After Migration

1. **Monitor for 48 Hours**
   - Watch for any unexpected issues
   - Monitor error rates
   - Check user feedback

2. **Set Up Continuous Deployment**
   - Verify auto-deployment from Git works
   - Test preview deployments for PRs
   - Configure branch deployments if needed

3. **Update Internal Documentation**
   - Update team wiki/docs with new URLs
   - Document new deployment process
   - Update runbooks

4. **Decommission Lovable**
   - Once stable, archive Lovable project
   - Download any Lovable-specific logs/data
   - Cancel Lovable subscription if needed

5. **Optimize**
   - Review bundle size warnings
   - Implement code splitting if needed
   - Set up CDN for static assets
   - Configure caching headers

## Conclusion

Migrating from Lovable Cloud to independent deployment gives you:
- Full control over your infrastructure
- Standard Git-based deployment workflow
- Better cost predictability
- No platform lock-in
- Industry-standard tooling

The Supabase backend remains unchanged, so all your data, users, and functionality continue to work seamlessly.

## Support

If you encounter issues during migration:
- Check `docs/DEPLOYMENT_GUIDE.md` for detailed instructions
- Review platform-specific documentation
- Check Supabase documentation
- Open an issue on GitHub

## References

- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Backup and Restore Guide](BACKUP_AND_RESTORE.md)
- [Database Schema](DATABASE_SCHEMA.md)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com)
