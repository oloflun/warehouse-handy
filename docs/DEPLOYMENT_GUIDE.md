# Deployment Guide - Migrating from Lovable Cloud

This guide provides step-by-step instructions for deploying the Warehouse Handy application independently of Lovable cloud, using standard hosting platforms.

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Backend Setup (Supabase)](#backend-setup-supabase)
4. [Frontend Deployment Options](#frontend-deployment-options)
5. [Environment Configuration](#environment-configuration)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Removing Lovable Dependencies](#removing-lovable-dependencies)

## Overview

The Warehouse Handy application consists of:
- **Backend**: Supabase (already deployed independently)
- **Frontend**: React/Vite application (currently deployed via Lovable)

To migrate away from Lovable, you need to:
1. Ensure Supabase backend is properly configured
2. Deploy the frontend to an alternative hosting platform
3. Remove Lovable-specific dependencies
4. Configure custom domain (optional)

## Prerequisites

### Required Tools
- Node.js (v18 or higher)
- npm or yarn
- Git
- Supabase CLI (optional, but recommended)

### Required Accounts
- Supabase account (already have: project `qadtpwdokdfqtpvwwhsn`)
- Hosting platform account (choose one):
  - Vercel (recommended for React apps)
  - Netlify
  - Cloudflare Pages
  - GitHub Pages
  - AWS Amplify
  - Or any static hosting service

### Installation
```bash
# Install Node.js (if not already installed)
# macOS
brew install node

# Linux
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Supabase CLI (optional)
npm install -g supabase

# Verify installations
node --version
npm --version
supabase --version
```

## Backend Setup (Supabase)

Your Supabase backend is already set up and configured. This section verifies it's ready for independent deployment.

### 1. Verify Supabase Project

Current project details:
- **Project ID**: `qadtpwdokdfqtpvwwhsn`
- **URL**: `https://qadtpwdokdfqtpvwwhsn.supabase.co`
- **Region**: Check in Supabase Dashboard

### 2. Verify Database Migrations

All migrations are already applied. To verify:

```bash
# Clone the repository (if not already done)
git clone https://github.com/oloflun/warehouse-handy.git
cd warehouse-handy

# Check migration files
ls -la supabase/migrations/

# Expected: 29 migration files
```

### 3. Verify Edge Functions

All 18 Edge Functions should be deployed:

```bash
# List deployed functions
supabase functions list --project-ref qadtpwdokdfqtpvwwhsn

# Expected functions:
# - analyze-delivery-note
# - analyze-label
# - auto-resolve-item-id
# - batch-resolve-all-ids
# - delete-user
# - fdt-api-explorer
# - invite-user
# - list-users
# - reset-user-password
# - resolve-sellus-item-ids
# - retry-failed-syncs
# - sync-inventory-to-sellus
# - sync-products-from-sellus
# - sync-purchase-order-to-sellus
# - sync-sales-from-retail
# - toggle-user-limited
# - update-sellus-stock
# - update-user-profile
```

If any functions are missing, deploy them:

```bash
# Deploy all functions
supabase functions deploy --project-ref qadtpwdokdfqtpvwwhsn

# Or deploy specific function
supabase functions deploy [function-name] --project-ref qadtpwdokdfqtpvwwhsn
```

### 4. Configure Function Secrets

If your Edge Functions use environment variables:

```bash
# Example: Set OpenAI API key (if used)
supabase secrets set OPENAI_API_KEY=your-key-here --project-ref qadtpwdokdfqtpvwwhsn

# List all secrets
supabase secrets list --project-ref qadtpwdokdfqtpvwwhsn
```

### 5. Verify Authentication Settings

In Supabase Dashboard → Authentication → URL Configuration:
- Add your new frontend URL(s) to "Redirect URLs"
- Add your domain to "Site URL"

Example:
```
Site URL: https://your-app.vercel.app
Redirect URLs:
  - https://your-app.vercel.app/**
  - http://localhost:8080/**
```

## Frontend Deployment Options

Choose one of the following platforms for deploying your React frontend.

### Option 1: Vercel (Recommended)

Vercel is optimized for React/Vite applications and offers:
- ✅ Zero-config deployment
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Automatic deployments from Git
- ✅ Free tier available

#### Steps:

1. **Sign up for Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub

2. **Import Repository**
   - Click "New Project"
   - Import `oloflun/warehouse-handy`
   - Vercel will auto-detect Vite settings

3. **Configure Environment Variables**
   ```
   VITE_SUPABASE_PROJECT_ID=qadtpwdokdfqtpvwwhsn
   VITE_SUPABASE_PUBLISHABLE_KEY=[your-anon-key]
   VITE_SUPABASE_URL=https://qadtpwdokdfqtpvwwhsn.supabase.co
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (~2-3 minutes)
   - Your app is live at `https://warehouse-handy.vercel.app`

5. **Configure Custom Domain (Optional)**
   - Go to Project Settings → Domains
   - Add your custom domain
   - Update DNS records as instructed

#### vercel.json Configuration

Create `vercel.json` in the project root:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Option 2: Netlify

Netlify is another excellent option for static sites.

#### Steps:

1. **Sign up for Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Sign up with GitHub

2. **Create New Site**
   - Click "Add new site" → "Import an existing project"
   - Choose GitHub and select `oloflun/warehouse-handy`

3. **Configure Build Settings**
   ```
   Build command: npm run build
   Publish directory: dist
   ```

4. **Environment Variables**
   ```
   VITE_SUPABASE_PROJECT_ID=qadtpwdokdfqtpvwwhsn
   VITE_SUPABASE_PUBLISHABLE_KEY=[your-anon-key]
   VITE_SUPABASE_URL=https://qadtpwdokdfqtpvwwhsn.supabase.co
   ```

5. **Deploy**
   - Click "Deploy site"
   - Your app is live at `https://[random-name].netlify.app`

#### netlify.toml Configuration

Create `netlify.toml` in the project root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Option 3: Cloudflare Pages

Cloudflare Pages offers excellent performance with global CDN.

#### Steps:

1. **Sign up for Cloudflare Pages**
   - Go to [pages.cloudflare.com](https://pages.cloudflare.com)
   - Sign up with GitHub

2. **Create New Project**
   - Click "Create a project"
   - Select `oloflun/warehouse-handy`

3. **Configure Build**
   ```
   Build command: npm run build
   Build output directory: dist
   ```

4. **Environment Variables**
   ```
   VITE_SUPABASE_PROJECT_ID=qadtpwdokdfqtpvwwhsn
   VITE_SUPABASE_PUBLISHABLE_KEY=[your-anon-key]
   VITE_SUPABASE_URL=https://qadtpwdokdfqtpvwwhsn.supabase.co
   ```

5. **Deploy**
   - Click "Save and Deploy"
   - Your app is live at `https://warehouse-handy.pages.dev`

### Option 4: GitHub Pages

Free hosting directly from your GitHub repository.

#### Steps:

1. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: GitHub Actions

2. **Create Workflow**
   Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
      - uses: actions/upload-pages-artifact@v2
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v2
        id: deployment
```

3. **Add Secrets**
   - Go to Settings → Secrets → Actions
   - Add the three environment variables

4. **Configure Base Path**
   Update `vite.config.ts`:

```typescript
export default defineConfig(({ mode }) => ({
  base: '/warehouse-handy/', // Add this line
  // ... rest of config
}));
```

5. **Deploy**
   - Push to main branch
   - GitHub Actions will build and deploy
   - Your app is live at `https://oloflun.github.io/warehouse-handy`

## Environment Configuration

### Getting Your Supabase Keys

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project `qadtpwdokdfqtpvwwhsn`
3. Go to Settings → API
4. Copy these values:
   - **Project URL**: `https://qadtpwdokdfqtpvwwhsn.supabase.co`
   - **anon public**: This is your `VITE_SUPABASE_PUBLISHABLE_KEY`

### Environment Variables Summary

```env
# Required for all deployments
VITE_SUPABASE_PROJECT_ID=qadtpwdokdfqtpvwwhsn
VITE_SUPABASE_PUBLISHABLE_KEY=[from Supabase Dashboard]
VITE_SUPABASE_URL=https://qadtpwdokdfqtpvwwhsn.supabase.co
```

## Removing Lovable Dependencies

To completely remove Lovable-specific code and dependencies:

### 1. Update vite.config.ts

Remove the `lovable-tagger` plugin:

```typescript
// Before
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
}));

// After
export default defineConfig(() => ({
  plugins: [react()],
}));
```

### 2. Update package.json

Remove the `lovable-tagger` dependency:

```bash
npm uninstall lovable-tagger
```

### 3. Update README.md

Remove Lovable-specific content and update with your new deployment information.

### 4. Remove Lovable References

```bash
# Search for any remaining Lovable references
grep -r "lovable" . --exclude-dir=node_modules --exclude-dir=.git
```

## Post-Deployment Verification

### 1. Test Core Functionality

After deployment, test these critical features:

- [ ] **User Authentication**
  - Sign in with existing user
  - Sign out
  - Password reset (if configured)

- [ ] **Database Operations**
  - View products
  - View inventory
  - Create/edit data (if you have permissions)

- [ ] **Edge Functions**
  - User management functions
  - Sync functions
  - Analysis functions

### 2. Check Browser Console

- Open browser DevTools (F12)
- Check Console for errors
- Verify API calls are successful

### 3. Test on Multiple Devices

- Desktop browser
- Mobile browser
- Different browsers (Chrome, Firefox, Safari)

### 4. Monitor Supabase Usage

- Go to Supabase Dashboard → Reports
- Check:
  - API requests
  - Database queries
  - Edge Function invocations
  - Any errors

## Continuous Deployment

### Automatic Deployments from Git

Most platforms support automatic deployments:

**Vercel/Netlify/Cloudflare:**
- Automatically deploy when you push to `main` branch
- Preview deployments for pull requests
- Rollback to previous deployments

**Configure Branch Deployments:**
- Production: `main` branch → `your-domain.com`
- Staging: `staging` branch → `staging.your-domain.com`
- Development: `dev` branch → `dev.your-domain.com`

## Troubleshooting

### Build Fails

```bash
# Clear cache and rebuild locally
rm -rf node_modules package-lock.json dist
npm install
npm run build
```

### Environment Variables Not Working

- Verify all variables start with `VITE_`
- Check spelling and case (exact match required)
- Redeploy after changing environment variables

### CORS Errors

- Add your frontend URL to Supabase → Authentication → URL Configuration
- Restart edge functions if needed

### 404 Errors on Refresh

- Ensure your hosting platform has SPA (Single Page Application) routing configured
- Check for `_redirects` (Netlify) or `vercel.json` redirects

## Cost Estimation

### Current Costs (with free tiers):

**Supabase:**
- Free tier: $0/month (includes 500MB database, 1GB file storage, 2GB bandwidth)
- Pro tier: $25/month (if needed for more resources)

**Vercel:**
- Free tier: $0/month (100GB bandwidth, unlimited deployments)
- Pro tier: $20/month (if needed for team features)

**Netlify:**
- Free tier: $0/month (100GB bandwidth, 300 build minutes)
- Pro tier: $19/month (if needed for more resources)

**Cloudflare Pages:**
- Free tier: $0/month (unlimited requests, 500 builds/month)
- No paid tier needed for most apps

**GitHub Pages:**
- Free: $0/month (1GB storage, 100GB bandwidth)

## Support and Resources

### Documentation
- Supabase Docs: https://supabase.com/docs
- Vercel Docs: https://vercel.com/docs
- Netlify Docs: https://docs.netlify.com
- Vite Docs: https://vitejs.dev

### Project Documentation
- `docs/BACKUP_AND_RESTORE.md` - Backup and restore procedures
- `docs/EMAIL_CONFIGURATION.md` - Email setup
- `docs/USER_MANAGEMENT_CHANGES.md` - User system details

### Community Support
- Supabase Discord: https://discord.supabase.com
- GitHub Issues: https://github.com/oloflun/warehouse-handy/issues

## Next Steps

After successful deployment:

1. ✅ **Test thoroughly** - Verify all features work
2. ✅ **Configure custom domain** - Use your own domain
3. ✅ **Set up monitoring** - Track errors and performance
4. ✅ **Configure backups** - Regular database backups (see `docs/BACKUP_AND_RESTORE.md`)
5. ✅ **Update documentation** - Document your specific deployment
6. ✅ **Train users** - Inform users of any URL changes

Congratulations! You've successfully migrated away from Lovable Cloud! 🎉
