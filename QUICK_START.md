# Quick Start Guide - FDT API Explorer

## Immediate Actions Required

### Step 1: Configure Environment Variables (5 minutes)

1. Go to your Supabase Dashboard
2. Navigate to: Project Settings → Edge Functions → Environment Variables
3. Add these required variables:

**For FDT API Integration:**
```
FDT_SELLUS_BASE_URL=https://your-fdt-api-url.com/v1
FDT_SELLUS_API_KEY=your-api-key-here
FDT_SELLUS_BRANCH_ID=5
```

**For Scanning Features (Delivery Notes & Labels):**
```
GOOGLE_AI_API_KEY=your-google-ai-api-key-here
```

**Important**: 
- Replace the placeholder values with your actual credentials
- Contact FDT Sellus support for FDT API credentials
- For Google AI API key setup, see detailed guide: [docs/GEMINI_API_SETUP.md](docs/GEMINI_API_SETUP.md)
- **The GOOGLE_AI_API_KEY is required for scanning features**. Without it, delivery note and label scanning will fail with a configuration error.

### Step 2: Test the Connection (2 minutes)

1. Navigate to your app's `/fdt-explorer` page
2. Click the **"Testa anslutning"** (Test Connection) button in the top right
3. Wait for the response

**Expected Results**:
- ✅ Green success message: "Anslutning lyckades! FDT API fungerar korrekt."
- ✅ Response viewer shows product groups data
- ❌ Red error message: Check the error details and fix configuration

### Step 3: Test a Few Endpoints (5 minutes)

Try these endpoints in order:

1. **Product Groups** (already tested if connection succeeded)
   - Endpoint: `productgroups`
   - Method: GET
   - Expected: List of product categories

2. **Branches**
   - Endpoint: `branches`
   - Method: GET
   - Expected: List of stores/warehouses
   - Verify: Your branch ID (default 5) is in the list

3. **Items**
   - Endpoint: `items?branchId=5`
   - Method: GET
   - Expected: List of products
   - If empty: Products might be filtered by branch or product group

### Step 4: Test Product Sync (5 minutes)

1. Go to the Integrations page (`/`)
2. Find "Artiklar" (Articles) section
3. Click **"Synkronisera"** button
4. Wait for completion message
5. Check the sync log table:
   - Should show number of products synced
   - Check for any errors in error column

### Step 5: Verify in Database (2 minutes)

1. Go to Supabase Table Editor
2. Open `products` table
3. Look for products with `fdt_sellus_article_id` populated
4. Check `fdt_sync_log` table for detailed logs

## Common Issues & Quick Fixes

### Issue: "FDT_SELLUS_BASE_URL not configured"
**Fix**: Add the environment variable in Supabase settings (see Step 1)

### Issue: "All authentication strategies failed"
**Fix**: 
1. Verify your API key is correct
2. Check with FDT support which auth header format they use
3. Look at error details for WWW-Authenticate header hints

### Issue: "404 Not Found"
**Fix**:
1. Verify the endpoint URL with FDT documentation
2. Try removing query parameters (e.g., `?branchId=5`)
3. Check if the resource ID exists in your FDT account

### Issue: "No products found"
**Fix**:
1. Products might be filtered by product group "1200- Elon"
2. Try different branch IDs
3. Verify products exist in your FDT account

### Issue: "Cannot sync: No numeric ID"
**Fix**:
1. This is normal for first-time setup
2. The system will automatically resolve IDs
3. Or manually run `batch-resolve-all-ids` function

## What Changed?

The FDT API Explorer has been completely rebuilt:

- ✅ **Unified Implementation**: All sync functions now use the same robust API caller
- ✅ **Better Error Messages**: Clear, actionable error messages with troubleshooting tips
- ✅ **12 Auth Strategies**: Automatically tries different authentication methods
- ✅ **Configuration Validation**: Immediate feedback on missing environment variables
- ✅ **Comprehensive Logging**: All API calls logged to `fdt_sync_log` table
- ✅ **17 Predefined Endpoints**: Coverage for all major FDT resources
- ✅ **PATCH Method Support**: Full HTTP method support (GET, POST, PUT, PATCH, DELETE)

## Next Steps

After completing the quick start:

1. **Read Full Documentation**: See `test-fdt-api.md` for comprehensive testing procedures
2. **Review Changes**: See `OVERHAUL_SUMMARY.md` for technical details
3. **Monitor Logs**: Regularly check `fdt_sync_log` table for sync health
4. **Test Inventory Sync**: Once products are synced, test inventory export
5. **Test Sales Sync**: Verify sales data imports correctly

## Need Help?

1. **Check the Logs**: `fdt_sync_log` table has detailed error messages
2. **Review Documentation**: `test-fdt-api.md` has troubleshooting guide
3. **Contact FDT Support**: For API-specific questions or credentials
4. **Check Supabase Logs**: Edge Function logs in Supabase dashboard

## Success Indicators

You'll know everything is working when:
- ✅ Test Connection button shows green success
- ✅ Product sync completes without errors
- ✅ Products table has items with `fdt_sellus_article_id`
- ✅ Sync log shows successful operations
- ✅ Inventory sync updates stock in FDT
- ✅ Sales sync imports sales records

Good luck! 🚀
