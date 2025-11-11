# Quick Setup: Google Gemini API for Scanning

## 🚀 Setup in 5 Minutes

### Step 1: Get API Key (2 min)
1. Open: **https://aistudio.google.com/app/apikey**
2. Sign in with Google
3. Click **"Create API key"**
4. Choose **"Create API key in new project"**
5. **Copy the key** (starts with `AIza`)

### Step 2: Add to Supabase (2 min)
1. Open Supabase Dashboard
2. Go to: **Settings** → **Edge Functions** → **Environment Variables**
3. Click **"Add new variable"**
4. Enter:
   - **Name**: `GOOGLE_AI_API_KEY`
   - **Value**: Paste your key
5. Click **Save**

### Step 3: Test (1 min)
1. Open your WMS app
2. Go to **Följesedlar** (Delivery Notes)
3. Click **"+ Ny följesedel"**
4. Click **"Starta kamera"**
5. Scan a delivery note

✅ **Success**: Items appear, no errors  
❌ **Still errors**: Wait 5 minutes for Supabase to refresh, then try again

---

## Need Help?

**Full Guide**: `docs/GEMINI_API_SETUP.md`  
**Troubleshooting**: See section "Troubleshooting" in GEMINI_API_SETUP.md

## Common Issues

### "GOOGLE_AI_API_KEY not configured"
- Variable name must be **exactly** `GOOGLE_AI_API_KEY` (case-sensitive)
- Wait 5 minutes after adding
- Or restart edge functions manually

### "Gemini API error: 401"
- API key is invalid
- Generate a new key: https://aistudio.google.com/app/apikey
- Update in Supabase

### "Gemini API error: 429"
- Rate limit hit (15 requests/minute on free tier)
- Wait a few minutes
- For production, upgrade to Vertex AI

---

**That's it!** Scanning should now work.
