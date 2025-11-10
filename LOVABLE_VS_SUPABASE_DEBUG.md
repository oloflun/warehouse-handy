# Critical Troubleshooting: Lovable vs Supabase API Differences

## Current Situation

**Previous fixes did NOT resolve the issue:**
- ✅ Changed POST to PUT (correct but didn't fix it)
- ✅ Removed Content-Type from GET (correct but didn't fix it)

This means the problem is more fundamental - likely configuration or URL format.

## Immediate Diagnostic Steps

### Step 1: Run the Diagnostic Function

**From browser console on any page of your app:**

```javascript
const result = await supabase.functions.invoke('diagnostic-fdt-api', {
  body: { testEndpoint: '/productgroups' }
});
console.log(JSON.stringify(result.data, null, 2));
```

**Look for:**
1. `configuration.baseUrl` - Should be `https://stagesellus.fdt.se/12345/api`
2. `configuration.hasApiKey` - Should be `true`
3. `configuration.apiKeyLength` - Should be > 20
4. `testRequest.fullUrl` - Should be complete valid URL
5. `fetchResult.status` - What HTTP status code?
6. `fetchResult.bodyPreview` - What does FDT API return?
7. `fetchError` - Any error message?

### Step 2: Check Supabase Environment Variables

Go to: Supabase Dashboard → Settings → Edge Functions → Environment Variables

**Required variables:**
```
FDT_SELLUS_BASE_URL = https://stagesellus.fdt.se/12345/api
FDT_SELLUS_API_KEY = your-api-key-here
FDT_SELLUS_BRANCH_ID = 5
```

**Common mistakes:**
- ❌ Base URL has trailing slash: `https://stagesellus.fdt.se/12345/api/`
- ❌ Base URL missing `/api`: `https://stagesellus.fdt.se/12345`
- ❌ Wrong tenant ID: Using `12345` when it should be different
- ❌ API key has "Bearer " prefix (should be raw key)
- ❌ API key expired or wrong

### Step 3: Test with curl Directly

**From your local machine:**

```bash
# Test 1: Verify base URL format
curl -v "https://stagesellus.fdt.se/12345/api/productgroups" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

**Expected**: 200 OK with JSON data

**If 401**: API key is wrong
**If 404**: URL path is wrong
**If connection error**: Network/DNS issue

### Step 4: Compare Swagger URL vs Configured URL

**Swagger URL**: `https://stagesellus.fdt.se/12345/api/swagger/index.html`

**This tells us:**
- Base should be: `https://stagesellus.fdt.se/12345/api`
- Tenant ID: `12345` (might be different for you!)
- API paths start from `/api/`

**Your FDT_SELLUS_BASE_URL must match this pattern!**

## Most Likely Issues

### Issue A: Wrong Base URL Format

**Problem**: Base URL doesn't match actual API structure

**Symptoms**:
- 404 Not Found errors
- "Invalid URL" messages
- All endpoints fail

**Solution**: Set base URL to exact format:
```
https://stagesellus.fdt.se/[YOUR_TENANT_ID]/api
```

Replace `[YOUR_TENANT_ID]` with actual value from Swagger URL.

### Issue B: Wrong or Expired API Key

**Problem**: API key is incorrect

**Symptoms**:
- 401 Unauthorized
- "Authentication failed" messages
- WWW-Authenticate headers in response

**Solution**:
1. Get fresh API key from FDT admin panel
2. Update `FDT_SELLUS_API_KEY` in Supabase
3. Restart edge functions (redeploy)

### Issue C: Missing Tenant ID Context

**Problem**: Lovable might have added tenant context automatically

**Symptoms**:
- Endpoints return wrong data
- BranchId filtering doesn't work
- Multi-tenant issues

**Solution**: Verify tenant ID in base URL matches your account.

### Issue D: Network/Firewall Issues

**Problem**: Supabase servers can't reach FDT API

**Symptoms**:
- Connection timeout
- Network errors
- Intermittent failures

**Solution**: 
1. Contact FDT to whitelist Supabase IPs
2. Check if VPN/firewall blocks Supabase

## Lovable vs Supabase Comparison

### What Lovable Likely Did:

```typescript
// Lovable might have had:
const response = await fetch(
  `https://api.lovable.dev/proxy/fdt/${endpoint}`,  // Proxy!
  {
    headers: {
      'X-Tenant-Id': '12345',  // Automatic tenant context
      'X-API-Key': apiKey,  // Different header name?
    }
  }
);
```

### What Supabase Does Now:

```typescript
// Supabase direct call:
const response = await fetch(
  `${baseUrl}${endpoint}`,  // Direct to FDT
  {
    headers: {
      'Authorization': `Bearer ${apiKey}`,  // Standard Bearer
      'Accept': 'application/json',
    }
  }
);
```

**Key Difference**: Lovable used a proxy, Supabase calls directly!

## Action Plan

### Phase 1: Verify Configuration (5 minutes)

1. Run diagnostic function
2. Check environment variables in Supabase
3. Verify base URL format
4. Confirm API key is set

### Phase 2: Test Direct API Access (10 minutes)

1. Get API credentials from FDT admin
2. Test with curl from your machine
3. Test with curl from Supabase region (if possible)
4. Document exact working curl command

### Phase 3: Update Configuration (5 minutes)

Based on working curl command:
1. Update `FDT_SELLUS_BASE_URL` to match
2. Update `FDT_SELLUS_API_KEY` if needed
3. Redeploy edge functions
4. Test with diagnostic function again

### Phase 4: Verify Fix (10 minutes)

1. Test FDT API Explorer
2. Test product sync
3. Test inventory sync
4. Check sync logs for errors

## Debug Output Template

**Please provide this information:**

```
=== Diagnostic Function Output ===
[Paste JSON output here]

=== Supabase Environment Variables ===
FDT_SELLUS_BASE_URL: [show first 40 chars]
FDT_SELLUS_API_KEY: [show YES/NO and length]
FDT_SELLUS_BRANCH_ID: [show value]

=== curl Test Result ===
[Paste command and response]

=== Swagger UI URL ===
[Your actual Swagger URL]

=== Error Messages ===
[Any error messages from logs or UI]
```

## Quick Fixes to Try

### Fix 1: Update Base URL

If your Swagger is at `https://stagesellus.fdt.se/XXXXX/api/swagger/index.html`:

```bash
# In Supabase Edge Function environment variables:
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/XXXXX/api
```

Replace `XXXXX` with your actual tenant/store ID.

### Fix 2: Refresh API Key

1. Log into FDT admin panel
2. Generate new API key
3. Copy the FULL key (not truncated)
4. Update in Supabase (don't add "Bearer ")
5. Redeploy

### Fix 3: Remove Trailing Slashes

```bash
# WRONG:
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/12345/api/

# CORRECT:
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/12345/api
```

## Contact Support If...

Contact FDT support if:
- curl with correct credentials fails
- API key seems correct but returns 401
- Base URL format matches Swagger but returns 404
- Network timeouts from Supabase servers
- Need to whitelist Supabase IP addresses

Provide them:
- Your tenant/account ID
- Swagger URL
- Error messages from diagnostic function
- Approximate time of failed requests (for their logs)

## Success Indicators

You'll know it's fixed when:
- ✅ Diagnostic function shows `fetchResult.ok: true`
- ✅ Diagnostic function shows `fetchResult.status: 200`
- ✅ Body preview shows actual JSON data
- ✅ FDT API Explorer "Testa anslutning" succeeds
- ✅ Product sync returns count > 0
- ✅ No errors in sync log

## Most Common Solution

**90% of the time, it's one of these:**

1. **Base URL has wrong format** - Check for trailing slashes, missing parts
2. **API key is expired/wrong** - Get fresh key from FDT
3. **Tenant ID mismatch** - Using wrong ID in base URL

**Run the diagnostic function first - it will tell you which one!**
