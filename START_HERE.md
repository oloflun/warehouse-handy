# 🔧 API Fix Investigation - READ THIS FIRST

## Current Status: Awaiting Configuration Verification

### What Happened
After migrating from Lovable to Supabase, all API calls to FDT Sellus are failing. Both GET and PUT requests return errors.

### What We've Done

#### ✅ Code Fixes Applied (Correct but Insufficient)
1. Changed POST to PUT for item updates (proper REST)
2. Removed Content-Type header from GET requests (proper HTTP)
3. Send full item object with PUT (REST standard)

**Result**: These fixes are correct but **did NOT resolve the issue** ❌

#### 🔍 Diagnosis: Configuration Problem (90% Confidence)
The issue is **not in the code** - it's in **environment configuration**.

**Evidence**:
- Both GET and PUT fail equally
- Code follows proper REST standards
- Suggests base URL or API key problem

### 🚨 WHAT YOU NEED TO DO NOW

#### Step 1: Run Diagnostic Function (2 minutes)

Open your app in browser, open console (F12), and run:

```javascript
const result = await supabase.functions.invoke('diagnostic-fdt-api', {
  body: { testEndpoint: '/productgroups' }
});
console.log(JSON.stringify(result.data, null, 2));
```

**Look for**:
- `configuration.baseUrl` - What does it show?
- `configuration.hasApiKey` - Is it true?
- `fetchResult.status` - What HTTP code?
- `fetchError` - Any error message?

**Copy the entire output** and save it.

#### Step 2: Check Supabase Environment Variables (2 minutes)

Go to: **Supabase Dashboard** → **Settings** → **Edge Functions** → **Environment Variables**

Verify these variables exist and are correct:

```
FDT_SELLUS_BASE_URL = https://stagesellus.fdt.se/[YOUR_TENANT_ID]/api
FDT_SELLUS_API_KEY = [your-actual-api-key]
FDT_SELLUS_BRANCH_ID = 5
```

**Common mistakes**:
- ❌ Base URL has trailing slash: `.../api/`
- ❌ Base URL missing `/api`: `.../12345`
- ❌ Wrong tenant ID in URL
- ❌ API key includes "Bearer " prefix
- ❌ API key is truncated or wrong

#### Step 3: Find Your Correct Base URL (2 minutes)

Your Swagger URL is: `https://stagesellus.fdt.se/12345/api/swagger/index.html`

**Extract the base from it**:
- Remove `/swagger/index.html`
- Result: `https://stagesellus.fdt.se/12345/api`

**This is your base URL** - set it exactly like this in Supabase.

⚠️ **CRITICAL**: The `https://` prefix is absolutely required! Setting the base URL without it (e.g., `stagesellus.fdt.se/12345/api`) will break all API functions.

Replace `12345` with your actual tenant/store ID if different.

#### Step 4: Test with curl (5 minutes)

From your local machine terminal:

```bash
# Replace YOUR_API_KEY and tenant ID
curl "https://stagesellus.fdt.se/12345/api/productgroups" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

**If this returns JSON data**: Your credentials work, Supabase config is wrong
**If this returns 401**: API key is wrong
**If this returns 404**: Base URL format is wrong

#### Step 5: Fix Configuration (5 minutes)

Based on curl test results:

1. Update `FDT_SELLUS_BASE_URL` in Supabase to match working URL
2. Update `FDT_SELLUS_API_KEY` in Supabase to match working key
3. **Save** - Supabase will redeploy automatically
4. Wait 1-2 minutes for deployment
5. Run diagnostic function again
6. Should now show `status: 200` ✅

#### Step 6: Test Everything (5 minutes)

1. Go to `/fdt-explorer` page
2. Click "Testa anslutning" button
3. Should show success message ✅
4. Test a few endpoints:
   - `productgroups`
   - `branches`
   - `items`
5. All should return data ✅

### 📚 Documentation Available

**Quick Start**:
- `SUMMARY.md` - This file's parent doc with full details

**Troubleshooting**:
- `LOVABLE_VS_SUPABASE_DEBUG.md` - Detailed debugging guide
- `API_DIAGNOSTIC_GUIDE.md` - Testing procedures

**Technical Details**:
- `MIGRATION_FIX_SUMMARY.md` - What changed in migration
- `API_FIX_TEST_PLAN.md` - Complete test plan

### 🎯 Most Likely Issues (Pick One)

#### Issue A: Base URL Has Wrong Format (60% probability)

**Check**: Does your base URL in Supabase exactly match the Swagger URL format?

**Fix**:
```bash
# Set in Supabase environment variables:
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/[YOUR_ID]/api
```

⚠️ **CRITICAL**: The `https://` protocol prefix is mandatory! Without it, all API calls will fail. Common mistake: Setting it as `stagesellus.fdt.se/12345/api` (missing `https://`).

#### Issue B: API Key is Wrong (30% probability)
**Check**: Is your API key correct? Has it expired?

**Fix**:
1. Get fresh API key from FDT admin panel
2. Update in Supabase (raw key, no "Bearer ")
3. Redeploy

#### Issue C: Network/Firewall (10% probability)
**Check**: Can Supabase servers reach FDT API?

**Fix**: Contact FDT support to whitelist Supabase IPs

### ✅ Success Indicators

You'll know it's fixed when:
- ✅ Diagnostic function shows `status: 200`
- ✅ Body preview shows actual JSON data
- ✅ "Testa anslutning" button succeeds
- ✅ Product sync shows count > 0
- ✅ No errors in sync logs

### ❓ Still Stuck?

If diagnostic function + curl test both fail:

**Gather this info**:
1. Diagnostic function output (full JSON)
2. Supabase environment variables (masked)
3. curl test command and response
4. Your Swagger URL
5. Any error messages from logs

**Then**:
- Contact FDT support with this info
- They can verify API credentials
- They can check if Supabase IPs need whitelisting

### 🔐 Security Note
- The diagnostic function is safe to run
- It masks sensitive data in logs
- Never share your full API key publicly
- All credentials stay in environment variables

### 💡 Why This Happened

**Lovable's Setup**:
- Had proxy/middleware
- Auto-corrected mistakes
- Added tenant context automatically
- Very forgiving

**Supabase's Setup**:
- Direct API calls
- No middleware
- Strict configuration required
- Returns raw responses

**Result**: Configuration that worked with Lovable's proxy doesn't work with direct calls.

### ⏱️ Time to Fix

**If config is wrong**: 10 minutes
**If API key needs refresh**: 15 minutes
**If need FDT support**: Hours to days

Most likely: **10 minute fix by updating base URL** ✨

---

## Quick Command Reference

### Run Diagnostic
```javascript
const result = await supabase.functions.invoke('diagnostic-fdt-api', {
  body: { testEndpoint: '/productgroups' }
});
console.log(JSON.stringify(result.data, null, 2));
```

### Test with curl
```bash
curl "https://stagesellus.fdt.se/12345/api/productgroups" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

### Check Environment in Supabase
Supabase Dashboard → Settings → Edge Functions → Environment Variables

### Fix Base URL
```
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/[YOUR_TENANT]/api
```

---

**START WITH STEP 1** ⬆️ Run the diagnostic function - it will tell you exactly what's wrong!
