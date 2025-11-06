# FDT API Testing Guide

This guide helps you test and validate the FDT API Explorer and sync functionality.

## Prerequisites

Before testing, ensure the following environment variables are configured in your Supabase Edge Functions:

1. `FDT_SELLUS_BASE_URL` - The base URL for the FDT Sellus API (e.g., `https://api.sellus.com/v1`)
2. `FDT_SELLUS_API_KEY` - Your API key for authentication
3. `FDT_SELLUS_BRANCH_ID` - The branch/store ID to use (default: `5`)

## Test Steps

### 1. Configuration Validation

1. Navigate to `/fdt-explorer` in your app
2. Check for the configuration status alert at the top
3. If there are errors, the alert will show what's missing
4. Configure missing environment variables in Supabase Dashboard:
   - Go to Project Settings → Edge Functions → Add Environment Variable

### 2. Basic Endpoint Testing

Test the following endpoints in order:

#### Test 1: Product Groups
- Endpoint: `productgroups`
- Method: `GET`
- Expected: List of product groups/categories
- Look for: Group with name containing "1200" or "Elon"

#### Test 2: Branches
- Endpoint: `branches`
- Method: `GET`
- Expected: List of branches/stores
- Validate: Your branch ID (default 5) exists in the list

#### Test 3: Items (Basic)
- Endpoint: `items?branchId=5`
- Method: `GET`
- Expected: List of items/products
- Note: May be empty if filtered by branch

#### Test 4: Items (Full)
- Endpoint: `items/full?branchId=5`
- Method: `GET`
- Expected: Full product data with inventory
- Note: Response structure may differ from /items

#### Test 5: Specific Item
- Endpoint: `items/{id}?branchId=5`
- Method: `GET`
- Article ID: Enter a known article ID (e.g., `297093`)
- Expected: Single item details

### 3. Sync Function Testing

#### Product Import Sync
1. Go to the Integrations page
2. Find "Artiklar" (Articles) sync
3. Click "Synkronisera" button
4. Check the sync log for:
   - Number of products synced
   - Any errors
   - Duration

#### Inventory Export Sync
1. Ensure you have products with FDT article IDs
2. Click "Synkronisera" for "Lagersaldo till Sellus"
3. Monitor the sync log
4. Verify stock levels updated in FDT

#### Sales Import Sync
1. Click "Synkronisera" for "Försäljning"
2. Check for imported sales records
3. Verify dates and quantities

### 4. Common Issues and Solutions

#### Issue: "FDT_SELLUS_BASE_URL not configured"
**Solution:** Add the environment variable in Supabase:
- Variable name: `FDT_SELLUS_BASE_URL`
- Value: Your FDT API base URL (check with FDT support)

#### Issue: "All authentication strategies failed"
**Solution:** 
- Verify your API key is correct
- Check with FDT support which auth header format they use
- Look at the error details for WWW-Authenticate header hints

#### Issue: "404 Not Found"
**Solution:**
- Check if the endpoint path is correct
- Verify the resource ID exists
- Try without query parameters first

#### Issue: "No products found"
**Solution:**
- Verify productGroupId filter is correct
- Try different branch IDs
- Check if products exist in your FDT account

#### Issue: "Cannot sync: No numeric ID"
**Solution:**
- Run the "batch-resolve-all-ids" function
- This will fetch and cache numeric IDs for all products
- Or manually test with a specific article ID first

### 5. Endpoint Reference

Common FDT API endpoints (adjust based on your actual API):

```
GET /productgroups - List product groups
GET /productgroups/{id} - Get specific group
GET /items - List items
GET /items/full - List items with full details
GET /items/{id} - Get specific item
POST /items - Create item
PUT /items/{id} - Update item
DELETE /items/{id} - Delete item
GET /orders - List orders
GET /orders/{id} - Get specific order
GET /customers - List customers
GET /suppliers - List suppliers
GET /branches - List branches
GET /inventory - Get inventory levels
```

### 6. Response Format Notes

The FDT API may return data in different formats:
- Direct array: `[{...}, {...}]`
- Wrapped in results: `{ results: [{...}], total: 10 }`
- Wrapped in items: `{ items: [{...}], count: 10 }`
- Wrapped in data: `{ data: [{...}], metadata: {...} }`

The system handles all these formats automatically.

### 7. Logging and Debugging

All API calls are logged to the `fdt_sync_log` table:
- View in Supabase Table Editor
- Check `sync_type`, `status`, `error_message`
- Review `request_payload` and `response_payload` for details
- Monitor `duration_ms` for performance

### 8. Support

If issues persist:
1. Check the sync log table for detailed errors
2. Review Supabase Edge Function logs
3. Contact FDT Sellus support for API documentation
4. Verify your API access permissions
