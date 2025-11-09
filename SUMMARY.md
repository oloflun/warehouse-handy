# API Fix Summary - What We've Done

## Problem
API calls stopped working after migrating from Lovable to Vercel/Supabase. Both GET and PUT requests fail.

## Investigation Journey

### Phase 1: REST Protocol Fixes (Attempted)
✅ **Fixed**: Changed POST to PUT for item updates
✅ **Fixed**: Removed Content-Type header from GET requests
❌ **Result**: Did NOT resolve the issue

**Conclusion**: Code changes were correct REST practices, but the problem is deeper.

### Phase 2: Root Cause Analysis (Current)
🔍 **Finding**: The issue is likely **configuration**, not code logic

**Evidence**:
- Proper REST methods don't fix it
- Proper headers don't fix it
- Both GET and PUT fail equally
- Suggests configuration or URL format problem

## Most Likely Issues

### Issue #1: Base URL Configuration (HIGH PROBABILITY)
**Problem**: `FDT_SELLUS_BASE_URL` environment variable has wrong format

**Common mistakes**:
```bash
# WRONG - has trailing slash
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/12345/api/

# WRONG - missing /api
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/12345

# WRONG - wrong tenant ID
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/WRONG_ID/api

# CORRECT
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/12345/api
```

**How to verify**: Look at Swagger URL and extract the base from it.

### Issue #2: API Key Problem (MEDIUM PROBABILITY)
**Problem**: API key is expired, wrong, or has wrong format

**Common mistakes**:
```bash
# WRONG - includes "Bearer " prefix
FDT_SELLUS_API_KEY=Bearer abc123def456

# WRONG - truncated or partial key
FDT_SELLUS_API_KEY=abc123...

# CORRECT - raw key value
FDT_SELLUS_API_KEY=abc123def456ghi789jkl
```

**How to verify**: Test with curl using the same key.

### Issue #3: Lovable Proxy (LOW PROBABILITY)
**Problem**: Lovable routed through a proxy that we don't have in Supabase

**What Lovable might have done**:
- Proxy: `https://api.lovable.dev/proxy/fdt/...`
- Auto-added tenant context
- Transformed requests
- Fixed malformed calls

**Supabase does**: Direct calls to FDT API, no middleware

## Tools Created for Diagnosis

### 1. Diagnostic Edge Function
**File**: `supabase/functions/diagnostic-fdt-api/index.ts`

**Usage**:
```javascript
const result = await supabase.functions.invoke('diagnostic-fdt-api', {
  body: { testEndpoint: '/productgroups' }
});
console.log(JSON.stringify(result.data, null, 2));
```

**Shows**:
- Exact base URL configured
- API key presence and length
- Full constructed URL
- Actual fetch() result
- HTTP status code
- Response body preview

### 2. Troubleshooting Guides

**Files**:
- `LOVABLE_VS_SUPABASE_DEBUG.md` - Main troubleshooting guide
- `MIGRATION_FIX_SUMMARY.md` - Migration analysis
- `API_DIAGNOSTIC_GUIDE.md` - Testing procedures
- `API_FIX_TEST_PLAN.md` - Test plan

## What User Needs to Do

### Step 1: Run Diagnostic (5 min)
```javascript
// In browser console on any page
const result = await supabase.functions.invoke('diagnostic-fdt-api', {
  body: { testEndpoint: '/productgroups' }
});
console.log(JSON.stringify(result.data, null, 2));
```

**Look for**:
- `configuration.baseUrl` - Is it correct?
- `fetchResult.status` - What HTTP code?
- `fetchResult.bodyPreview` - What does API return?
- `fetchError` - Any error message?

### Step 2: Check Supabase Config (2 min)
Go to: **Supabase Dashboard → Settings → Edge Functions → Environment Variables**

Verify:
```
FDT_SELLUS_BASE_URL = https://stagesellus.fdt.se/[YOUR_TENANT]/api
FDT_SELLUS_API_KEY = [your-key-here]
FDT_SELLUS_BRANCH_ID = 5
```

### Step 3: Test with curl (5 min)
```bash
curl "https://stagesellus.fdt.se/12345/api/productgroups" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

**If this works**: Configuration in Supabase is wrong
**If this fails**: API credentials are wrong

### Step 4: Fix Configuration (5 min)
Based on curl test:
1. Update `FDT_SELLUS_BASE_URL` to match working URL
2. Update `FDT_SELLUS_API_KEY` to match working key
3. Deploy changes (automatic in Supabase)
4. Test again with diagnostic function

### Step 5: Verify Fix (5 min)
1. Diagnostic function shows `status: 200`
2. FDT API Explorer "Testa anslutning" succeeds
3. Product sync shows count > 0
4. Inventory sync works

## Code Changes Made (For Reference)

### File: `supabase/functions/_shared/fdt-api.ts`
**Change**: Only add Content-Type for POST/PUT/PATCH
```typescript
// Before
const fetchOptions: RequestInit = {
  method,
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',  // ❌ Always present
    'Accept': 'application/json',
  },
};

// After
const headers: Record<string, string> = {
  'Authorization': `Bearer ${apiKey}`,
  'Accept': 'application/json',
};

if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
  headers['Content-Type'] = 'application/json';  // ✅ Only when needed
  fetchOptions.body = JSON.stringify(body);
}
```

### File: `supabase/functions/update-sellus-stock/index.ts`
**Change**: Use PUT instead of POST, send full item object
```typescript
// Before
let updateResponse = await callFDTApi({
  endpoint: `/items/${numericId}?branchId=${branchId}`,
  method: 'POST',  // ❌ Wrong method
  body: { stock: totalStock },  // ❌ Partial data
});

// After
const updatePayload = {
  ...existingItem,  // ✅ Full item object
  stock: totalStock,
  quantity: totalStock,
  availableQuantity: totalStock,
};

let updateResponse = await callFDTApi({
  endpoint: `/items/${numericId}?branchId=${branchId}`,
  method: 'PUT',  // ✅ Correct method
  body: updatePayload,
});
```

## Why These Changes Were Made

**REST Standards**:
- PUT = Update existing resource (requires full object)
- POST = Create new resource
- GET = Read (no Content-Type needed, no body)
- PATCH = Partial update

**Our code was**:
- Using POST to update (should be PUT)
- Sending Content-Type on GET (should be omitted)

**These are correct fixes** but didn't solve the problem because **the issue is configuration, not code**.

## Expected Outcome

Once configuration is corrected:

✅ **GET requests work**:
```
GET /productgroups → 200 OK with data
GET /branches → 200 OK with data
GET /items → 200 OK with array
```

✅ **PUT requests work**:
```
PUT /items/123 → 200 OK or 204 No Content
Read-after-write confirms update
```

✅ **Sync functions work**:
```
Product sync: Count > 0
Inventory sync: Updates sent
No errors in logs
```

## Security Note
✅ CodeQL scan: 0 alerts
✅ No vulnerabilities introduced
✅ API credentials remain secure in environment variables
✅ Diagnostic function masks sensitive data in logs

## Files in This PR

**Code**:
- `supabase/functions/_shared/fdt-api.ts` - Header handling fix
- `supabase/functions/update-sellus-stock/index.ts` - HTTP method fix
- `supabase/functions/diagnostic-fdt-api/index.ts` - NEW diagnostic tool

**Documentation**:
- `LOVABLE_VS_SUPABASE_DEBUG.md` - Main troubleshooting guide
- `MIGRATION_FIX_SUMMARY.md` - Migration analysis
- `API_DIAGNOSTIC_GUIDE.md` - Testing procedures
- `API_FIX_TEST_PLAN.md` - Test plan
- `SUMMARY.md` - This file

## Next Actions

**IMMEDIATE** (User must do):
1. Run diagnostic function
2. Check Supabase environment variables
3. Test with curl
4. Fix configuration based on results
5. Report back with diagnostic output

**AFTER FIX** (Testing):
1. Verify diagnostic shows 200 OK
2. Test FDT API Explorer
3. Run product sync
4. Run inventory sync
5. Monitor logs

## Support

If issues persist:
1. Share diagnostic function output
2. Share curl test results
3. Verify Swagger URL
4. Contact FDT support for API credentials

## Confidence Level

**Configuration Issue**: 90% confident
- Both GET and PUT fail
- Code fixes don't help
- Suggests environment problem

**Base URL Format**: 60% likely
**API Key Issue**: 30% likely
**Other**: 10% likely

The diagnostic function will reveal which one!
