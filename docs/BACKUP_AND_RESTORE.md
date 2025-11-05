# Backup and Restore Guide

This document provides comprehensive instructions for backing up and restoring the Warehouse Handy application and its Supabase backend.

## Table of Contents
1. [Overview](#overview)
2. [Database Backup](#database-backup)
3. [Edge Functions Backup](#edge-functions-backup)
4. [Configuration Backup](#configuration-backup)
5. [Full Restore Process](#full-restore-process)
6. [Disaster Recovery](#disaster-recovery)

## Overview

The Warehouse Handy application consists of:
- **Frontend**: React/Vite application
- **Backend**: Supabase (PostgreSQL database + Edge Functions)
- **Storage**: Supabase Storage (if used)
- **Authentication**: Supabase Auth

All critical components must be backed up regularly to ensure business continuity.

## Database Backup

### Automated Backup via Supabase Dashboard

Supabase Pro plan includes automatic daily backups. To access:

1. Navigate to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `qadtpwdokdfqtpvwwhsn`
3. Go to Database → Backups
4. Download the latest backup

### Manual Database Export

#### Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref qadtpwdokdfqtpvwwhsn

# Export database schema and data
supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql

# Export only schema
supabase db dump --schema-only -f schema_$(date +%Y%m%d_%H%M%S).sql

# Export only data
supabase db dump --data-only -f data_$(date +%Y%m%d_%H%M%S).sql
```

#### Using PostgreSQL Tools Directly

```bash
# Get connection string from Supabase Dashboard → Settings → Database
# Connection string format: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Full database backup
pg_dump "postgresql://postgres:[PASSWORD]@db.qadtpwdokdfqtpvwwhsn.supabase.co:5432/postgres" \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup specific tables
pg_dump "postgresql://postgres:[PASSWORD]@db.qadtpwdokdfqtpvwwhsn.supabase.co:5432/postgres" \
  -t products -t inventory -t orders -t delivery_notes \
  > critical_tables_$(date +%Y%m%d_%H%M%S).sql
```

### What Gets Backed Up

The database backup includes:
- ✅ All tables and their data
- ✅ Database functions and stored procedures
- ✅ Row Level Security (RLS) policies
- ✅ Triggers and indexes
- ✅ Custom types and extensions
- ✅ User roles and permissions (in `user_roles` table)

### Current Database Schema

The following tables are included:
- `products` - Product catalog
- `locations` - Storage locations
- `inventory` - Current stock levels
- `transactions` - Stock movement history
- `orders` - Purchase orders
- `order_lines` - Order line items
- `delivery_notes` - Delivery note headers
- `delivery_note_items` - Delivery note line items
- `profiles` - User profile information
- `user_roles` - User permissions and roles
- `branches` - Branch/location information
- `sellus_sync_failures` - Integration sync failures
- `sellus_sync_discrepancies` - Integration discrepancies
- `fdt_sync_log` - FDT integration logs
- `fdt_sync_metadata` - FDT sync metadata
- `fdt_sync_status` - FDT sync status

## Edge Functions Backup

All Edge Functions are version controlled in this repository at `/supabase/functions/`.

### Current Edge Functions:
1. `analyze-delivery-note` - AI analysis of delivery notes
2. `analyze-label` - Label scanning and analysis
3. `auto-resolve-item-id` - Automatic item resolution
4. `batch-resolve-all-ids` - Batch item resolution
5. `delete-user` - User deletion (admin)
6. `fdt-api-explorer` - FDT API integration explorer
7. `invite-user` - User invitation system
8. `list-users` - List all users (admin)
9. `reset-user-password` - Password reset functionality
10. `resolve-sellus-item-ids` - Sellus integration item resolution
11. `retry-failed-syncs` - Retry failed sync operations
12. `sync-inventory-to-sellus` - Inventory sync to Sellus
13. `sync-products-from-sellus` - Product sync from Sellus
14. `sync-purchase-order-to-sellus` - Purchase order sync
15. `sync-sales-from-retail` - Sales data sync from retail
16. `toggle-user-limited` - Toggle user read-only status
17. `update-sellus-stock` - Update stock in Sellus
18. `update-user-profile` - User profile updates

### Backup Process

Functions are already backed up in Git. To ensure you have the latest:

```bash
# Clone or pull the repository
git clone https://github.com/oloflun/warehouse-handy.git
# or
git pull origin main

# Functions are in: ./supabase/functions/
```

### Deploy Functions to New Project

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy [function-name]

# Example:
supabase functions deploy delete-user
```

## Configuration Backup

### Environment Variables

Save your `.env` file securely:

```bash
# Current configuration (.env file):
VITE_SUPABASE_PROJECT_ID=qadtpwdokdfqtpvwwhsn
VITE_SUPABASE_PUBLISHABLE_KEY=[key]
VITE_SUPABASE_URL=https://qadtpwdokdfqtpvwwhsn.supabase.co
```

**⚠️ IMPORTANT**: Store this file in a secure location (password manager, encrypted storage). Never commit it to Git.

### Supabase Project Settings

Document these settings from Supabase Dashboard:

1. **Authentication Settings**
   - Email templates
   - Auth providers enabled
   - JWT expiration settings
   - Redirect URLs

2. **Database Settings**
   - Connection pooling settings
   - SSL enforcement
   - Allowed IP addresses

3. **Storage Settings**
   - Bucket configurations
   - RLS policies for storage

4. **Edge Function Settings**
   - Environment variables for each function
   - JWT verification settings (from `config.toml`)

Current function configurations in `/supabase/config.toml`:
```toml
[functions.analyze-delivery-note]
verify_jwt = false

[functions.analyze-label]
verify_jwt = true

# ... (see config.toml for all functions)
```

### API Keys and Secrets

Backup these from Supabase Dashboard → Settings → API:
- `anon` public key (safe to commit)
- `service_role` secret key (⚠️ NEVER commit, store securely)
- Database password
- JWT secret

## Full Restore Process

### Prerequisites

```bash
# Install required tools
npm install -g supabase
brew install postgresql  # or apt-get install postgresql-client on Linux
```

### Step 1: Create New Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in project details
4. Save the database password securely
5. Wait for project initialization (~2 minutes)

### Step 2: Restore Database

```bash
# Get connection string from new project
# Settings → Database → Connection string

# Restore from backup file
psql "postgresql://postgres:[NEW_PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
  < backup_YYYYMMDD_HHMMSS.sql

# Or use Supabase CLI
supabase db push
```

### Step 3: Run Migrations

If starting fresh without a full backup:

```bash
# Link to new project
supabase link --project-ref [NEW_PROJECT_REF]

# Apply all migrations in order
supabase db push

# Or manually run each migration
for migration in ./supabase/migrations/*.sql; do
  psql "postgresql://postgres:[PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
    < "$migration"
done
```

### Step 4: Deploy Edge Functions

```bash
# Set up function secrets (if any)
supabase secrets set OPENAI_API_KEY=[your-key]

# Deploy all functions
supabase functions deploy

# Verify deployment
supabase functions list
```

### Step 5: Update Frontend Configuration

Update `.env` file with new project details:

```bash
VITE_SUPABASE_PROJECT_ID=[NEW_PROJECT_REF]
VITE_SUPABASE_PUBLISHABLE_KEY=[NEW_ANON_KEY]
VITE_SUPABASE_URL=https://[NEW_PROJECT_REF].supabase.co
```

### Step 6: Configure Authentication

In Supabase Dashboard → Authentication:

1. **Email Templates**: Restore custom email templates
2. **Redirect URLs**: Add your application URLs
3. **SMTP Settings**: Configure if using custom SMTP (see `docs/EMAIL_CONFIGURATION.md`)
4. **Auth Providers**: Enable required providers

### Step 7: Restore Storage Buckets (if applicable)

```bash
# List buckets in old project
supabase storage list

# Create buckets in new project
supabase storage create [bucket-name]

# Copy files (manual or via script)
```

### Step 8: Test Application

```bash
# Build and test frontend
npm install
npm run build
npm run dev

# Test key functionality:
# - User login
# - Data retrieval
# - Edge function calls
# - Database writes
```

## Disaster Recovery

### Immediate Actions

1. **Assess the situation**: Determine what data/services are affected
2. **Switch to read-only mode** (if possible): Prevent further data corruption
3. **Notify stakeholders**: Inform users of the outage

### Recovery Steps

#### Scenario 1: Database Corruption

```bash
# 1. Create new Supabase project
# 2. Restore from latest backup (see Step 2 above)
# 3. Verify data integrity
# 4. Update DNS/environment variables
# 5. Test thoroughly before going live
```

#### Scenario 2: Accidental Data Deletion

```bash
# 1. Immediately stop application (prevent further changes)
# 2. Restore from most recent backup before deletion
# 3. If partial deletion, use point-in-time recovery (Supabase Pro)
# 4. Verify restored data
# 5. Resume operations
```

#### Scenario 3: Complete Project Loss

```bash
# Follow "Full Restore Process" above
# If no backup exists, check:
# - Supabase automatic backups (Pro plan)
# - Local development database dumps
# - Staging environment backups
```

### Recovery Time Objective (RTO)

Estimated recovery times:
- Database restore: 15-30 minutes
- Full system restore: 1-2 hours
- Complete rebuild from migrations: 2-4 hours

### Recovery Point Objective (RPO)

- With daily backups: Up to 24 hours of data loss
- With manual backups: Depends on backup frequency
- Recommended: Daily automated backups + weekly manual backups

## Best Practices

### Regular Backup Schedule

```bash
# Suggested cron job for daily backups
0 2 * * * cd /path/to/warehouse-handy && ./scripts/backup.sh
```

### Testing Restores

- Test restore process quarterly
- Verify data integrity after restore
- Document any issues encountered
- Update this document with lessons learned

### Version Control

- All migrations in Git: ✅
- All Edge Functions in Git: ✅
- Configuration files in Git: ✅ (except secrets)
- Regular commits and tags

### Security

- Encrypt backup files at rest
- Store backups in multiple locations (on-site, cloud)
- Restrict access to backup files
- Never commit secrets to Git
- Rotate API keys regularly

### Monitoring

- Set up alerts for failed backups
- Monitor backup file sizes (unexpected changes)
- Regular backup integrity checks
- Document backup locations

## Emergency Contacts

- Supabase Support: https://supabase.com/support
- Repository Owner: Anton Lundin (oloflundin@icloud.com)
- GitHub Repository: https://github.com/oloflun/warehouse-handy

## Appendix: Quick Reference

### Backup Checklist

- [ ] Database dump created
- [ ] Edge Functions code in Git
- [ ] Configuration documented
- [ ] Environment variables saved securely
- [ ] Auth settings documented
- [ ] Storage buckets documented
- [ ] API keys backed up securely
- [ ] Backup tested and verified

### Restore Checklist

- [ ] New Supabase project created
- [ ] Database restored
- [ ] Migrations applied
- [ ] Edge Functions deployed
- [ ] Environment variables updated
- [ ] Auth configured
- [ ] Storage restored
- [ ] Application tested
- [ ] Users notified

## Automated Backup Script

See `/scripts/backup.sh` for an automated backup script that can be run regularly.
