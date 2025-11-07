# FDT Integration Fixes

This document covers fixes for configuration checking and sync function error handling in the FDT Sellus integration.

## Latest Update: Simplified Authentication

### Change
The FDT API authentication has been simplified to use the Sellus API Key directly as the `Authorization` header value, instead of trying multiple authentication strategies.

### Benefits
1. **Faster API calls**: No need to try multiple auth strategies
2. **Clearer error messages**: Authentication failures are immediately clear
3. **Simpler code**: Removed complex auth strategy logic
4. **More reliable**: Direct approach eliminates auth strategy guessing

### Implementation
The API key is now sent directly:
```typescript
headers: {
  'Authorization': apiKey,  // Direct API key value
  'Content-Type': 'application/json',
  'Accept': 'application/json',
}
```

---

## Issue 1: Configuration Error in FDT API Explorer

### Problem

Users were experiencing a "Configuration Error" in the FDT API Explorer even though the environment variables `FDT_SELLUS_BASE_URL` and `FDT_SELLUS_API_KEY` were properly configured in Supabase.

#### Error Message
```
Configuration Error
Unable to verify configuration
Please configure FDT_SELLUS_BASE_URL and FDT_SELLUS_API_KEY in your Supabase Edge Function environment variables.
```

## Root Cause

The configuration check logic had several issues:

1. **Made actual API calls during configuration verification**: The frontend would call the edge function with a real endpoint (e.g., "items"), which would attempt to make an actual API call to FDT Sellus. If this call failed for ANY reason (API down, network issues, wrong credentials, etc.), the error handling would be unclear.

2. **Threw errors instead of returning structured responses**: When environment variables were missing, the edge function would throw an error that got caught in the catch block, making it difficult to distinguish between different types of failures.

3. **No dedicated verification mode**: There was no way to check if environment variables were configured without triggering a full API call.

## Solution

### Changes Made

#### 1. Edge Function (`supabase/functions/fdt-api-explorer/index.ts`)

Added a new `verifyConfigOnly` parameter to the request interface:

```typescript
interface ExplorerRequest {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  verifyConfigOnly?: boolean;  // NEW
}
```

When `verifyConfigOnly` is true, the function now:
- Checks if environment variables exist without making any API calls
- Returns a structured response with detailed configuration status
- Provides clear messaging about which specific variables are missing

Example response when config is valid:
```json
{
  "success": true,
  "configStatus": {
    "hasBaseUrl": true,
    "hasApiKey": true,
    "isConfigured": true
  },
  "message": "Configuration is valid"
}
```

Example response when config is incomplete:
```json
{
  "success": false,
  "configStatus": {
    "hasBaseUrl": false,
    "hasApiKey": true,
    "isConfigured": false
  },
  "message": "Missing: FDT_SELLUS_BASE_URL"
}
```

#### 2. Frontend (`src/pages/FDTExplorer.tsx`)

Updated the `checkConfiguration()` function to:
- Use the new `verifyConfigOnly: true` parameter
- Parse the structured `configStatus` response
- Display more accurate error messages showing which specific variables are missing
- Handle edge cases better with improved error logging

The configuration check now shows specific information:
```
Missing: FDT_SELLUS_BASE_URL
```
or
```
Missing: FDT_SELLUS_API_KEY
```
or
```
Missing: FDT_SELLUS_BASE_URL and FDT_SELLUS_API_KEY
```

## Benefits

1. **Faster configuration checks**: No API call needed, just env var verification
2. **More accurate diagnostics**: Know exactly which variables are missing
3. **Better error handling**: Structured responses instead of thrown errors
4. **Backwards compatible**: Falls back to old error message parsing if needed
5. **Improved user experience**: Clear, actionable error messages

## Testing

To verify the fix works:

1. **With env vars configured**: The FDT Explorer should show a success message and allow testing endpoints
2. **Without env vars**: Clear error message showing which variables are missing
3. **Partial configuration**: Shows which specific variable is missing (e.g., only API_KEY missing)

## Deployment

After deploying this fix:

1. Ensure the edge function is redeployed to Supabase
2. Clear browser cache to get the updated frontend
3. Test the configuration check in the FDT API Explorer

## Future Improvements

Consider adding:
- A "Test Connection" button that makes a real API call to verify credentials work
- Environment variable management UI in the app
- Automatic refresh of configuration status when env vars change

---

## Issue 2: Sync Functions Failing Silently

### Problem

Sync functions for Articles and Stock were returning "successfully synced 0 posts" without clear error messages when the actual issue was:
- No products found from FDT API
- Missing environment variables
- API authentication failures

### Root Cause

1. **Silent failures**: When no data was returned from the API, functions would continue and report "synced 0" as if it was successful
2. **Credential errors threw exceptions**: The shared `callFDTApi` function threw errors for missing credentials instead of returning structured error responses
3. **Hardcoded values**: BranchId was hardcoded instead of using environment variables
4. **Unclear error messages**: Error messages didn't provide enough context for troubleshooting

### Solution

#### 1. Shared API Function (`_shared/fdt-api.ts`)

Changed credential validation to return structured errors instead of throwing:

```typescript
if (!baseUrl || !apiKey) {
  const missingVars = [];
  if (!baseUrl) missingVars.push('FDT_SELLUS_BASE_URL');
  if (!apiKey) missingVars.push('FDT_SELLUS_API_KEY');
  const errorMsg = `FDT API credentials not configured: Missing ${missingVars.join(' and ')}`;
  console.error(`❌ ${errorMsg}`);
  return {
    success: false,
    error: errorMsg,
    duration: 0,
  };
}
```

#### 2. Product Sync (`sync-products-from-sellus/index.ts`)

- Added `FDT_SELLUS_BRANCH_ID` environment variable support
- Returns detailed error when no products found:

```typescript
if (!articles || articles.length === 0) {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'No products found from FDT API...',
      synced: 0,
      errors: 0,
      debugInfo: {
        branchId: branchId,
        productGroupId: elonGroupId,
        elonGroup: elonGroup,
        responseStructure: Object.keys(result.data || {})
      }
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

#### 3. Inventory Sync (`sync-inventory-to-sellus/index.ts`)

- Fixed null check ordering to prevent errors
- Returns clear message when no products have FDT article IDs:

```typescript
if (!products || products.length === 0) {
  return new Response(
    JSON.stringify({
      success: false,
      synced: 0,
      skipped: 0,
      errors: 0,
      message: 'No products with FDT Sellus article IDs found. Run sync-products-from-sellus first to import products.',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### Benefits

1. **Clear error messages**: Users now see exactly what went wrong
2. **Actionable feedback**: Error messages include suggestions for how to fix the issue
3. **Debug information**: Detailed debug info helps troubleshoot API changes
4. **Consistent error handling**: All sync functions use the same error handling pattern
5. **Environment variable support**: Branch ID can now be configured via `FDT_SELLUS_BRANCH_ID`

### Understanding "Successfully Synced 0 Posts"

This message can mean different things:

#### Expected Scenarios (Not Errors)
- **Stock Sync**: If there are no products with stock changes, syncing 0 items is correct
- **No FDT Products**: If you haven't imported products from Sellus yet, there's nothing to sync

#### Error Scenarios
- **No products found**: FDT API returns empty array - now shows error with debug info
- **Authentication failed**: API credentials invalid - now shows clear error message
- **Wrong branch ID**: Configured branch doesn't have products - debug info shows branch used
- **API structure changed**: Response format different than expected - debug info shows actual structure

### Troubleshooting Sync Errors

#### 1. Check Environment Variables

All FDT functions require these environment variables in Supabase:
- `FDT_SELLUS_BASE_URL`: Base URL for the FDT Sellus API
- `FDT_SELLUS_API_KEY`: API key for authentication
- `FDT_SELLUS_BRANCH_ID`: (Optional) Branch ID, defaults to "5"

#### 2. Check Configuration Status

Use the FDT API Explorer to verify configuration:
1. Navigate to the FDT API Explorer
2. Check the configuration status banner at the top
3. Green banner = Configuration valid
4. Red banner = Missing environment variables (shows which ones)

#### 3. Test API Connectivity

In the FDT API Explorer:
1. Select "Produkter med lagersaldo (/items)" endpoint
2. Click "Testa API-anrop"
3. Check the response:
   - Success: API is working, credentials are valid
   - 401 Error: Invalid API key
   - Other errors: Check error message for details

#### 4. Sync Order

When setting up for the first time, run syncs in this order:

1. **First**: `sync-products-from-sellus` - Imports articles from FDT
   - This populates the products table with FDT article IDs
   - Required before any other sync will work

2. **Second**: `resolve-sellus-item-ids` - Resolves numeric IDs
   - Maps FDT article numbers to internal numeric IDs
   - Required for stock updates to work

3. **Finally**: `sync-inventory-to-sellus` - Syncs stock levels
   - Updates stock in FDT based on WMS inventory
   - Will show "synced 0" if no products have FDT IDs set

### Common Error Messages and Solutions

| Error Message | Cause | Solution |
|--------------|-------|----------|
| "FDT API credentials not configured" | Environment variables missing | Configure `FDT_SELLUS_BASE_URL` and `FDT_SELLUS_API_KEY` in Supabase |
| "No products found from FDT API" | API returns empty results | Check branch ID, product group filter, or API credentials |
| "No products with FDT Sellus article IDs found" | Products not imported yet | Run `sync-products-from-sellus` first |
| "Cannot sync: No numeric ID for article X" | Item ID not resolved | Run `resolve-sellus-item-ids` or manually set numeric IDs |
| "Item X not found" | Product doesn't exist in FDT | Check if article ID is correct in FDT Sellus |

### Testing Sync Functions

After deploying these fixes:

1. **Test Configuration Check**:
   - Go to FDT API Explorer
   - Should show green success banner if env vars are configured
   - Should show red error banner with specific missing vars if not configured

2. **Test Product Sync**:
   ```bash
   # Should return detailed error if no products found
   # Should return success with count > 0 if products exist
   ```

3. **Test Inventory Sync**:
   ```bash
   # Should return clear message if no products have FDT IDs
   # Should return synced count if products exist
   ```

### Deployment Checklist

- [ ] Configure `FDT_SELLUS_BASE_URL` in Supabase Edge Functions
- [ ] Configure `FDT_SELLUS_API_KEY` in Supabase Edge Functions  
- [ ] Configure `FDT_SELLUS_BRANCH_ID` (optional, defaults to "5")
- [ ] Deploy updated edge functions
- [ ] Clear browser cache to get updated frontend
- [ ] Test configuration in FDT API Explorer
- [ ] Run `sync-products-from-sellus` to import articles
- [ ] Run `resolve-sellus-item-ids` to resolve numeric IDs
- [ ] Test `sync-inventory-to-sellus` to verify stock sync works
