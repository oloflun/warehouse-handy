# Quick Start Guide

Get Warehouse Handy running in under 10 minutes!

## Prerequisites

- Node.js 18+ installed
- Git installed
- Supabase account (or create one at [supabase.com](https://supabase.com))

## Option 1: Deploy to Vercel (Fastest) 🚀

1. **Click to Deploy**
   
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oloflun/warehouse-handy)

2. **Add Environment Variables** (after import)
   ```
   VITE_SUPABASE_PROJECT_ID=qadtpwdokdfqtpvwwhsn
   VITE_SUPABASE_PUBLISHABLE_KEY=[get-from-supabase-dashboard]
   VITE_SUPABASE_URL=https://qadtpwdokdfqtpvwwhsn.supabase.co
   ```

3. **Update Supabase**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard) → Authentication → URL Configuration
   - Add your Vercel URL to "Redirect URLs": `https://your-app.vercel.app/**`

4. **Done!** Your app is live 🎉

## Option 2: Run Locally for Development

```bash
# 1. Clone the repository
git clone https://github.com/oloflun/warehouse-handy.git
cd warehouse-handy

# 2. Install dependencies
npm install

# 3. Create .env file
cat > .env << 'EOF'
VITE_SUPABASE_PROJECT_ID=qadtpwdokdfqtpvwwhsn
VITE_SUPABASE_PUBLISHABLE_KEY=[your-key-here]
VITE_SUPABASE_URL=https://qadtpwdokdfqtpvwwhsn.supabase.co
EOF

# 4. Start development server
npm run dev

# 5. Open http://localhost:8080 in your browser
```

## Option 3: Deploy to Netlify

1. **Import to Netlify**
   - Go to [netlify.com](https://netlify.com)
   - "Add new site" → "Import an existing project"
   - Connect GitHub and select `oloflun/warehouse-handy`

2. **Configure Build**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Add environment variables (same as Vercel above)

3. **Deploy**
   - Click "Deploy site"
   - Update Supabase redirect URLs with your Netlify URL

4. **Done!** Your app is live 🎉

## Getting Supabase Keys

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (or use existing project: `qadtpwdokdfqtpvwwhsn`)
3. Go to Settings → API
4. Copy these values:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Project Reference** → `VITE_SUPABASE_PROJECT_ID` (from URL)

## First Steps After Deployment

1. **Log In**
   - Use your existing credentials
   - Or create a new admin user

2. **Test Core Features**
   - View inventory
   - Check delivery notes
   - Test product search

3. **Configure Users**
   - Go to User Management page
   - Invite team members
   - Set appropriate roles

## Troubleshooting

### "Cannot connect to Supabase"
- Verify environment variables are set correctly
- Check Supabase project is active
- Ensure all variables start with `VITE_`

### "Authentication not working"
- Add your deployment URL to Supabase → Authentication → Redirect URLs
- Clear browser cache and cookies
- Try incognito mode

### "Page shows 404 on refresh"
- For Vercel: Ensure `vercel.json` is in root
- For Netlify: Ensure `netlify.toml` is in root
- Check deployment logs for errors

## Need More Help?

- 📖 **Full Documentation**: See `/docs` directory
  - [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) - Detailed deployment instructions
  - [BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) - Backup procedures
  - [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) - Database documentation
  - [MIGRATION_FROM_LOVABLE.md](docs/MIGRATION_FROM_LOVABLE.md) - Migration guide

- 🐛 **Issues**: [GitHub Issues](https://github.com/oloflun/warehouse-handy/issues)
- 📧 **Email**: oloflundin@icloud.com

## What's Included?

- ✅ **Backend**: Supabase (PostgreSQL + Edge Functions)
- ✅ **Database**: 29 migrations pre-configured
- ✅ **Edge Functions**: 18 functions ready to use
- ✅ **Authentication**: User management with role-based access
- ✅ **UI**: Modern, responsive React interface
- ✅ **Mobile**: Full mobile support
- ✅ **Security**: Row-level security policies
- ✅ **Documentation**: Comprehensive docs in `/docs`

## Next Steps

1. ✅ **Customize**: Update branding and colors
2. ✅ **Configure Email**: Set up SMTP for user invitations (see `docs/EMAIL_CONFIGURATION.md`)
3. ✅ **Set Up Backups**: Run `./scripts/backup.sh` regularly
4. ✅ **Add Custom Domain**: Configure in your hosting platform
5. ✅ **Monitor**: Set up uptime monitoring
6. ✅ **Train Users**: Share documentation with your team

---

**Ready in minutes, scalable for years** 🚀
