# 🚀 Deploy Warehouse Handy to Supabase - Complete Guide

**Project**: Logic WMS  
**Supabase Project ID**: sublzjeyxfaxiekacfme  
**Status**: Ready for deployment

This guide will help you deploy the complete Warehouse Handy application (database + functions + frontend) to your Supabase project.

## ⚡ Quick Deploy (15 minutes)

### Step 1: Deploy Database (5 minutes)

#### Option A: Using Supabase SQL Editor (Easiest) ✅

1. **Open Supabase SQL Editor**
   - Go to: https://supabase.com/dashboard/project/sublzjeyxfaxiekacfme/sql
   - Or navigate to: Dashboard → SQL Editor

2. **Create New Query**
   - Click "New query"

3. **Copy Database Schema**
   - Open the file `DEPLOY_DATABASE.sql` in this repository
   - Copy the entire contents (1268 lines)
   - Paste into the SQL Editor

4. **Run the Migration**
   - Click "Run" (or press Ctrl+Enter)
   - Wait for completion (should take 10-30 seconds)
   - You should see "Success" message

5. **Verify Tables Were Created**
   - Go to: Dashboard → Database → Tables
   - You should see these tables:
     - ✅ products
     - ✅ locations
     - ✅ inventory
     - ✅ transactions
     - ✅ orders
     - ✅ order_lines
     - ✅ delivery_notes
     - ✅ delivery_note_items
     - ✅ profiles
     - ✅ user_roles
     - ✅ branches
     - ✅ sellus_sync_failures
     - ✅ sellus_sync_discrepancies
     - ✅ fdt_sync_log
     - ✅ fdt_sync_metadata
     - ✅ fdt_sync_status

#### Option B: Using psql Command Line

```bash
# Get your database password from:
# https://supabase.com/dashboard/project/sublzjeyxfaxiekacfme/settings/database

# Run the migration
psql "postgresql://postgres:[YOUR_PASSWORD]@db.sublzjeyxfaxiekacfme.supabase.co:5432/postgres" \
  < DEPLOY_DATABASE.sql
```

### Step 2: Deploy Edge Functions (5 minutes)

You have 18 Edge Functions to deploy:

#### Prerequisites
```bash
# Install Supabase CLI if not already installed
# macOS:
brew install supabase/tap/supabase

# Windows (PowerShell):
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux:
curl -fsSL https://github.com/supabase/cli/releases/download/v1.123.4/supabase_linux_amd64.tar.gz | tar -xz && sudo mv supabase /usr/local/bin/
```

#### Deploy Functions

```bash
# 1. Login to Supabase
supabase login

# 2. Link to your project
cd warehouse-handy
supabase link --project-ref sublzjeyxfaxiekacfme

# 3. Set secrets for Edge Functions
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Ymx6amV5eGZheGlla2FjZm1lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjI2MTg4NCwiZXhwIjoyMDc3ODM3ODg0fQ.T5m2p6uEq3XOB-K_KedU7VeTan2ShdvdGSzCTA-CthU" --project-ref sublzjeyxfaxiekacfme

supabase secrets set SUPABASE_URL="https://sublzjeyxfaxiekacfme.supabase.co" --project-ref sublzjeyxfaxiekacfme

supabase secrets set SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Ymx6amV5eGZheGlla2FjZm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjE4ODQsImV4cCI6MjA3NzgzNzg4NH0._vwVJb2Z8YGvng1yynO6HzMf3_rwydeuULukhsRcvY0" --project-ref sublzjeyxfaxiekacfme

# 4. Deploy all functions
supabase functions deploy --project-ref sublzjeyxfaxiekacfme
```

This will deploy all 18 functions:
1. analyze-delivery-note
2. analyze-label
3. auto-resolve-item-id
4. batch-resolve-all-ids
5. delete-user
6. fdt-api-explorer
7. invite-user
8. list-users
9. reset-user-password
10. resolve-sellus-item-ids
11. retry-failed-syncs
12. sync-inventory-to-sellus
13. sync-products-from-sellus
14. sync-purchase-order-to-sellus
15. sync-sales-from-retail
16. toggle-user-limited
17. update-sellus-stock
18. update-user-profile

#### Verify Functions Deployed

```bash
# List all deployed functions
supabase functions list --project-ref sublzjeyxfaxiekacfme
```

Or check in Supabase Dashboard:
- Go to: https://supabase.com/dashboard/project/sublzjeyxfaxiekacfme/functions

### Step 3: Deploy Frontend (5 minutes)

#### Option A: Deploy to Vercel (Recommended - Easiest)

1. **Import to Vercel**
   - Go to: https://vercel.com/new
   - Import `oloflun/warehouse-handy` repository
   - Vercel will auto-detect Vite configuration

2. **Set Environment Variables**
   In Vercel project settings, add:
   ```
   VITE_SUPABASE_PROJECT_ID=sublzjeyxfaxiekacfme
   VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Ymx6amV5eGZheGlla2FjZm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjE4ODQsImV4cCI6MjA3NzgzNzg4NH0._vwVJb2Z8YGvng1yynO6HzMf3_rwydeuULukhsRcvY0
   VITE_SUPABASE_URL=https://sublzjeyxfaxiekacfme.supabase.co
   ```

3. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - Note your deployment URL (e.g., `warehouse-handy.vercel.app`)

4. **Update Supabase Auth URLs**
   - Go to: https://supabase.com/dashboard/project/sublzjeyxfaxiekacfme/auth/url-configuration
   - Add to "Redirect URLs": `https://your-app.vercel.app/**`
   - Set "Site URL": `https://your-app.vercel.app`

#### Option B: Deploy to Netlify

1. **Import to Netlify**
   - Go to: https://app.netlify.com/start
   - Connect GitHub and select `oloflun/warehouse-handy`

2. **Configure Build**
   - Build command: `npm run build`
   - Publish directory: `dist`

3. **Set Environment Variables** (same as Vercel above)

4. **Deploy and update Auth URLs** (same as Vercel above)

## 📋 Post-Deployment Checklist

### 1. Verify Database ✅
- [ ] Go to Supabase Dashboard → Database → Tables
- [ ] Verify all 16 tables exist
- [ ] Check that RLS is enabled (shield icon should show)

### 2. Verify Edge Functions ✅
- [ ] Go to Supabase Dashboard → Edge Functions
- [ ] Verify all 18 functions are listed
- [ ] Test a simple function (e.g., `list-users`)

### 3. Verify Frontend ✅
- [ ] Open your deployment URL
- [ ] Check that login page loads
- [ ] Try logging in (create a user first if needed)
- [ ] Verify no console errors (F12 → Console)

### 4. Create First Admin User 🔐

#### Method 1: Via Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/sublzjeyxfaxiekacfme/auth/users
2. Click "Add user"
3. Enter email and password
4. Click "Create user"
5. Go to SQL Editor and run:
   ```sql
   -- Make the user an admin
   INSERT INTO user_roles (user_id, role, is_super_admin)
   VALUES (
     (SELECT id FROM auth.users WHERE email = 'your-email@example.com'),
     'admin',
     true
   );
   ```

#### Method 2: Via invite-user Function
Once deployed, you can use the invite-user function to create users.

### 5. Test Core Functionality 🧪
- [ ] Log in as admin
- [ ] Navigate to Products page
- [ ] Navigate to Inventory page
- [ ] Navigate to User Management
- [ ] Try creating a test product

## 🐛 Troubleshooting

### Database Migration Issues

**Error: "relation already exists"**
- This is normal if re-running migrations
- The migration is idempotent (safe to run multiple times)

**Error: "permission denied"**
- Make sure you're using the database password from Supabase Dashboard
- Check that you have the correct project ID

### Edge Function Issues

**Error: "Supabase CLI not found"**
- Install it: See prerequisites above

**Error: "Not logged in"**
- Run: `supabase login`
- Follow the browser authentication flow

**Functions not showing in dashboard**
- Wait 1-2 minutes for deployment to complete
- Refresh the dashboard page
- Check CLI output for errors

### Frontend Issues

**Error: "Cannot connect to Supabase"**
- Verify environment variables are set correctly
- Check that all three variables start with `VITE_`
- Redeploy after changing environment variables

**Error: "Authentication failed"**
- Add your deployment URL to Supabase Auth redirect URLs
- Make sure URL includes `/**` at the end

**Page shows 404 on refresh**
- For Vercel: Ensure `vercel.json` exists in repository (✅ already present)
- For Netlify: Ensure `netlify.toml` exists in repository (✅ already present)

## 📊 Deployment Status

Track your deployment progress:

- [ ] **Database**: Migrations applied (16 tables created)
- [ ] **Functions**: 18 Edge Functions deployed
- [ ] **Frontend**: Deployed to hosting platform
- [ ] **Auth URLs**: Updated in Supabase
- [ ] **First User**: Admin user created
- [ ] **Testing**: Core functionality verified

## 🎯 Quick Commands Reference

```bash
# Database
psql "postgresql://postgres:[PASSWORD]@db.sublzjeyxfaxiekacfme.supabase.co:5432/postgres" < DEPLOY_DATABASE.sql

# Functions - Deploy all
supabase functions deploy --project-ref sublzjeyxfaxiekacfme

# Functions - Deploy specific
supabase functions deploy delete-user --project-ref sublzjeyxfaxiekacfme

# Functions - List deployed
supabase functions list --project-ref sublzjeyxfaxiekacfme

# Frontend - Build locally
npm run build

# Frontend - Test locally
npm run dev
```

## 🆘 Need Help?

### Files in This Repository

- **DEPLOY_DATABASE.sql** - Complete database schema (run this first)
- **supabase/migrations/** - Individual migration files (already consolidated)
- **supabase/functions/** - All Edge Function source code
- **docs/DEPLOYMENT_GUIDE.md** - Detailed deployment guide
- **QUICK_START.md** - Quick start guide
- **docs/SECURITY.md** - Security best practices

### Support

- **Documentation**: Check `/docs` directory
- **Issues**: https://github.com/oloflun/warehouse-handy/issues
- **Email**: oloflundin@icloud.com

## ✅ Success Criteria

Your deployment is successful when:

1. ✅ 16 database tables visible in Supabase Dashboard
2. ✅ 18 Edge Functions deployed and running
3. ✅ Frontend accessible at deployment URL
4. ✅ Can log in and navigate the application
5. ✅ No console errors in browser
6. ✅ Core features working (products, inventory, etc.)

---

**Estimated Total Time**: 15-20 minutes  
**Difficulty**: Easy (mostly copy-paste)  
**Prerequisites**: Supabase account, Git, Node.js

🚀 **Ready to deploy? Start with Step 1: Deploy Database!**
