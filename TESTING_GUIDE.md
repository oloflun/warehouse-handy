# Edge Function Testing Guide

## Problem Fixed

**Issue**: Edge functions were failing with "Unauthorized - missing authorization header" even though API secrets were configured correctly.

**Root Cause**: Functions had conflicting authorization logic:
- `verify_jwt = false` in `config.toml` (meaning no JWT verification)
- BUT manual `Authorization` header checks in the code that rejected requests without auth headers
- This created a catch-22: functions expected auth but JWT verification was disabled

**Solution**: Removed manual authorization checks from functions with `verify_jwt = false`. These functions now work correctly without requiring user authentication (they use Supabase service role keys internally).

## Functions Fixed

The following functions have been fixed and no longer require Authorization headers:

1. **fdt-api-explorer** - Test FDT API endpoints
2. **sync-inventory-to-sellus** - Sync inventory to Sellus
3. **sync-sales-from-retail** - Import sales from Sellus
4. **update-sellus-stock** - Update stock for specific products
5. **sync-products-from-sellus** - Import products from Sellus

## How to Test

### Method 1: Using the Web UI

The easiest way to test is through the web application:

1. **Test FDT API Explorer**:
   - Navigate to `/fdt-explorer` in your app
   - Click "Testa anslutning" (Test Connection)
   - Expected: Green success message if FDT credentials are configured
   - Try different endpoints from the dropdown

2. **Test Product Sync**:
   - Navigate to `/` (Integrations page)
   - Find "Artiklar" (Articles) sync section
   - Click "Synkronisera" button
   - Check the sync log for results

3. **Test Inventory Sync**:
   - On Integrations page, find "Lagersaldo till Sellus"
   - Click "Synkronisera" button
   - Verify products are updated in Sellus

4. **Test Sales Sync**:
   - On Integrations page, find "Försäljning"
   - Click "Synkronisera" button
   - Check that sales are imported

### Method 2: Using cURL (Direct API Testing)

You can test the edge functions directly using cURL:

```bash
# Test FDT API Explorer
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/fdt-api-explorer' \
  -H 'Content-Type: application/json' \
  -d '{
    "endpoint": "productgroups",
    "method": "GET"
  }'

# Test Product Sync
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/sync-products-from-sellus' \
  -H 'Content-Type: application/json'

# Test Inventory Sync
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/sync-inventory-to-sellus' \
  -H 'Content-Type: application/json'

# Test Sales Sync
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/sync-sales-from-retail' \
  -H 'Content-Type: application/json'

# Test Stock Update (replace with actual product ID)
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/update-sellus-stock' \
  -H 'Content-Type: application/json' \
  -d '{
    "productId": "YOUR_PRODUCT_ID",
    "quantity": 0
  }'
```

**Note**: Replace `YOUR_PROJECT` with your actual Supabase project reference.

### Method 3: Using Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to Edge Functions
3. Select a function
4. Use the "Invoke function" feature to test

### Method 4: Check Logs

After invoking functions, check the logs:

1. **Supabase Dashboard Logs**:
   - Go to Logs section
   - Filter by function name
   - Look for error messages

2. **Database Sync Logs**:
   - Open Supabase Table Editor
   - Go to `fdt_sync_log` table
   - Check recent entries for errors

## Expected Results

### Successful Response Examples

**FDT API Explorer**:
```json
{
  "success": true,
  "status": 200,
  "data": [...],
  "duration_ms": 234
}
```

**Product Sync**:
```json
{
  "success": true,
  "synced": 15,
  "errors": 0,
  "message": "Synced 15 products from varugrupp 1200- Elon"
}
```

**Inventory Sync**:
```json
{
  "success": true,
  "synced": 10,
  "skipped": 5,
  "errors": 0
}
```

**Sales Sync**:
```json
{
  "success": true,
  "synced": 25,
  "errors": 0
}
```

### Error Response Examples

If you still get errors, check these common issues:

**Missing Environment Variables**:
```json
{
  "success": false,
  "error": "FDT_SELLUS_BASE_URL not configured"
}
```

**Solution**: Add environment variables in Supabase Dashboard:
- `FDT_SELLUS_BASE_URL`
- `FDT_SELLUS_API_KEY`
- `FDT_SELLUS_BRANCH_ID` (optional, defaults to 5)

**Authentication Failed**:
```json
{
  "success": false,
  "error": "FDT API error (401): Unauthorized"
}
```

**Solution**: Verify your API key is correct in Supabase environment variables.

**API Endpoint Not Found**:
```json
{
  "success": false,
  "error": "FDT API error (404): Not Found"
}
```

**Solution**: Check the endpoint URL with FDT documentation or support.

## Verification Checklist

After testing, verify:

- [ ] FDT API Explorer test connection succeeds
- [ ] Product sync completes without errors
- [ ] Products appear in `products` table with `fdt_sellus_article_id`
- [ ] Inventory sync updates stock in Sellus
- [ ] Sales sync imports orders
- [ ] `fdt_sync_log` table shows successful operations
- [ ] No "Unauthorized - missing authorization header" errors

## Troubleshooting

### Issue: Still getting authorization errors

**Check**:
1. Clear browser cache and reload
2. Verify edge functions are deployed (check Supabase Dashboard)
3. Check function logs for actual error messages

### Issue: Functions not updating

**Solution**:
1. Edge functions may need to be redeployed
2. In Supabase Dashboard, go to Edge Functions
3. Redeploy each affected function

### Issue: Environment variables not working

**Check**:
1. Verify variables are set in Supabase Edge Function settings (not project secrets)
2. Function must be redeployed after changing environment variables
3. Variable names are case-sensitive

## Next Steps

1. Test all functions using Method 1 (Web UI)
2. If any function fails, check logs and environment variables
3. Run a complete sync cycle: Products → Inventory → Sales
4. Monitor `fdt_sync_log` table for any ongoing issues
5. Set up scheduled syncs if needed

## Support

If issues persist:
1. Check Supabase function logs for detailed errors
2. Review `fdt_sync_log` table entries
3. Contact FDT Sellus support for API-specific questions
4. Verify API credentials and permissions
