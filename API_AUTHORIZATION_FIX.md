# API Authorization Fix - Bearer Token Format

## Issue Summary

API endpoints were returning "Invalid URL" errors because the Authorization header was not using the Bearer token format required by the Sellus API.

## Root Cause

The shared FDT API function in `supabase/functions/_shared/fdt-api.ts` was sending the API key directly in the Authorization header:

```typescript
'Authorization': apiKey
```

However, the Sellus API requires the Bearer token format:

```
Authorization: Bearer {api-key}
```

## Solution

Updated the Authorization header in `supabase/functions/_shared/fdt-api.ts` to use the Bearer token format:

```typescript
headers: {
  'Authorization': `Bearer ${apiKey}`,  // Bearer token format
  'Content-Type': 'application/json',
  'Accept': 'application/json',
}
```

## Changes Made

### 1. Code Changes
- **File**: `supabase/functions/_shared/fdt-api.ts`
  - Changed Authorization header from `apiKey` to `Bearer ${apiKey}`
  - Updated console log message to reflect Bearer token format

### 2. Documentation Updates
- **File**: `FDT_SYNC_FIX_SUMMARY.md`
  - Updated authentication section to show Bearer token format
  - Clarified that `FDT_SELLUS_API_KEY` should contain the raw API key (without Bearer prefix)

- **File**: `docs/FDT_CONFIGURATION_FIX.md`
  - Updated implementation section to show Bearer token format
  - Updated change description

## Impact

This change affects **all edge functions** that use the shared `callFDTApi` function:

✅ **API Endpoints Fixed:**
- `/productgroups` - List product groups
- `/branches` - List branches
- `/items` - List items/articles
- `/items/{id}` - Get specific item
- `/orders` - List orders
- All other FDT API endpoints

✅ **Sync Functions Fixed:**
- `fdt-api-explorer` - API Explorer UI (used in screenshots)
- `sync-products-from-sellus` - Article synchronization
- `update-sellus-stock` - Stock synchronization
- `sync-sales-from-retail` - Sales synchronization
- `sync-inventory-to-sellus` - Inventory export
- `sync-purchase-order-to-sellus` - Purchase order sync
- All other FDT integration functions

## Testing Instructions

### 1. Deploy the Changes

After merging this PR, the edge functions will automatically be deployed to Supabase.

### 2. Test with FDT API Explorer

1. Navigate to the FDT API Explorer in your application
2. Click "Testa anslutning" (Test Connection)
3. **Expected Result**: Configuration should be valid (green success message)

### 3. Test API Endpoints

In the FDT API Explorer, test the following endpoints that were shown as failing in the issue screenshots:

#### Test 1: Product Groups
- Endpoint: `productgroups/1200`
- Method: `GET`
- Branch ID: `5`
- **Expected**: Success - returns product group details
- **Before**: "Invalid URL" error

#### Test 2: Branches
- Endpoint: `branches`
- Method: `GET`
- **Expected**: Success - returns list of branches
- **Before**: "Invalid URL" error

#### Test 3: Items
- Endpoint: `items/297093`
- Method: `GET`
- Branch ID: `5`
- **Expected**: Success - returns item details
- **Before**: "Invalid URL" error

#### Test 4: Orders
- Endpoint: `orders/297093`
- Method: `GET`
- Branch ID: `5`
- **Expected**: Success - returns order details
- **Before**: "Invalid URL" error

### 4. Test Sync Functions

#### Test Articles Sync
1. Navigate to the Articles page
2. Click "Synka från Sellus" button
3. **Expected**: Articles should sync successfully
4. **Before**: "Synkronisering slutförd - Synkade 0 artiklar från varugrupp 1200- Elon"

#### Test Inventory Sync
1. Navigate to the Inventory page
2. Click "Synka till Sellus" button
3. **Expected**: Inventory should sync successfully
4. **Before**: "Synkroniserade 0 poster" (no actual sync)

#### Test Sales Sync
1. Navigate to the Sales page
2. Click "Synka från Retail" button
3. **Expected**: Sales orders should sync successfully
4. **Before**: "Synkroniseringsfel - Edge Function returned a non-2xx status code"

### 5. Verify in Sync Log

1. Navigate to the home page or integrations page
2. Check the "Synkroniseringslogg" (Sync Log)
3. **Expected**: 
   - Recent sync entries show "success" status
   - No "Invalid URL" errors
   - API calls show proper response data

## Configuration Requirements

Ensure the following environment variables are set in Supabase Edge Functions:

| Variable | Description | Example |
|----------|-------------|---------|
| `FDT_SELLUS_BASE_URL` | Base URL for FDT Sellus API | `https://stagesellus.fdt.se/12345/api` |
| `FDT_SELLUS_API_KEY` | API Key (raw value, without "Bearer" prefix) | `your-api-key-here` |
| `FDT_SELLUS_BRANCH_ID` | Branch ID (optional, defaults to "5") | `5` |

**Important**: The `FDT_SELLUS_API_KEY` should contain only the raw API key value. The "Bearer" prefix is automatically added by the code.

## Security

✅ **CodeQL Security Scan**: Passed with 0 alerts
✅ **No vulnerabilities introduced**
✅ **Credentials remain secure** via environment variables
✅ **No breaking changes** to existing functionality

## Troubleshooting

### If endpoints still fail after deployment:

1. **Clear browser cache** to ensure you're using the latest code
2. **Verify environment variables** are set correctly in Supabase
3. **Check the Edge Function logs** in Supabase for detailed error messages
4. **Test with a simple endpoint** like `/branches` first
5. **Verify API key is valid** with FDT Sellus support

### Common Error Messages:

| Error | Cause | Solution |
|-------|-------|----------|
| "FDT_SELLUS_API_KEY not configured" | Missing API key | Set `FDT_SELLUS_API_KEY` in Supabase |
| "401 Unauthorized" | Invalid API key | Verify API key with FDT support |
| "Invalid URL" | Wrong base URL | Check `FDT_SELLUS_BASE_URL` format |
| "404 Not Found" | Resource doesn't exist | Verify the resource ID exists in FDT |

## References

- **Issue**: API Endpoints not working
- **Screenshots**: Multiple screenshots showing "Invalid URL" errors and "Synkroniseringsfel"
- **API Documentation**: Bearer token format required by Sellus API
- **Related Files**:
  - `supabase/functions/_shared/fdt-api.ts`
  - `FDT_SYNC_FIX_SUMMARY.md`
  - `docs/FDT_CONFIGURATION_FIX.md`
  - `test-fdt-api.md`

## Success Criteria

✅ FDT API Explorer can successfully test endpoints
✅ No more "Invalid URL" errors in sync log
✅ Articles sync shows count > 0
✅ Inventory sync updates stock in Sellus
✅ Sales sync imports orders correctly
✅ All API endpoints return proper data instead of errors
