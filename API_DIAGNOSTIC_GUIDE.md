# API Diagnostic Tool

This document provides a systematic approach to diagnose and fix API call issues.

## Quick Diagnosis Steps

### 1. Check Basic Connectivity
Test if the API is reachable and authentication works:

```bash
# Test with curl (replace with actual values)
curl -X GET "https://stagesellus.fdt.se/12345/api/productgroups" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json"
```

**Expected**: 200 OK with JSON response
**If fails**: Check API key and base URL

### 2. Test Items GET Endpoint
```bash
curl -X GET "https://stagesellus.fdt.se/12345/api/items?branchId=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

**Expected**: List of items
**If fails**: Check if branchId is required/correct

### 3. Test Single Item GET
```bash
curl -X GET "https://stagesellus.fdt.se/12345/api/items/123?branchId=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

**Expected**: Single item details
**Note the structure** - this is what PUT needs to send back

### 4. Test PUT Update (THE FIX)
```bash
# First GET the item
ITEM_DATA=$(curl -X GET "https://stagesellus.fdt.se/12345/api/items/123?branchId=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json")

# Then PUT it back with updated stock
curl -X PUT "https://stagesellus.fdt.se/12345/api/items/123?branchId=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$ITEM_DATA"
```

**Expected**: 200 OK or 204 No Content
**If 405**: API doesn't support PUT, try PATCH
**If 400**: Request body format wrong

### 5. Test PATCH Update (Fallback)
```bash
curl -X PATCH "https://stagesellus.fdt.se/12345/api/items/123?branchId=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"stock": 10, "quantity": 10, "availableQuantity": 10}'
```

**Expected**: 200 OK
**If 405**: API doesn't support PATCH either (unusual)

## Common Issues and Solutions

### Issue: 405 Method Not Allowed
**Cause**: Using wrong HTTP method
**Solution**: Check Swagger UI for correct method
- GET for reading
- PUT for full updates
- PATCH for partial updates  
- POST for creating NEW resources only

### Issue: 400 Bad Request
**Causes**:
1. Request body format wrong
2. Missing required fields
3. Wrong field names/types
4. Invalid values

**Solution**: 
1. GET the item first to see exact structure
2. Compare against Swagger UI schema
3. Ensure all required fields are present
4. Match field names exactly (case-sensitive)

### Issue: 404 Not Found
**Causes**:
1. Wrong endpoint path
2. Resource ID doesn't exist
3. Wrong branchId

**Solution**:
1. Verify ID exists with GET /items
2. Check endpoint path in Swagger
3. Try without branchId parameter

### Issue: 401 Unauthorized
**Causes**:
1. API key wrong/expired
2. Missing Bearer prefix
3. Wrong authentication header

**Solution**:
1. Verify API key is correct
2. Ensure using `Bearer {key}` format
3. Check header name is exactly `Authorization`

## Using FDT API Explorer for Diagnosis

### Step 1: Test Connection
1. Go to `/fdt-explorer`
2. Click "Testa anslutning"
3. Should show green success

### Step 2: Test GET Endpoints
Test in this order:
1. `productgroups` - Simple list
2. `branches` - Check your branchId exists
3. `items` with branchId=5 - List items
4. `items/{id}` with specific ID - Single item

### Step 3: Analyze Responses
For each successful GET:
- Note the exact response structure
- Check field names (stock vs quantity vs availableQuantity)
- Verify data types
- See if data is wrapped (data.items vs direct array)

### Step 4: Test PUT/PATCH
Use the Explorer to test write operations:
1. First GET an item to get its full structure
2. Copy the response
3. Modify just the stock field
4. Send with PUT method
5. If fails, try PATCH

## Systematic Endpoint Verification

Create a checklist from Swagger UI:

```
API Base: https://stagesellus.fdt.se/12345/api

VERIFIED ENDPOINTS:
[ ] GET /productgroups
[ ] GET /productgroups/{id}
[ ] GET /branches
[ ] GET /branches/{id}
[ ] GET /items
[ ] GET /items/full (or does this exist?)
[ ] GET /items/{id}
[ ] GET /items?itemNumber={number}
[ ] GET /items/by-item-number/{number}
[ ] PUT /items/{id}
[ ] PATCH /items/{id}
[ ] GET /orders
[ ] GET /orders/{id}
[ ] GET /customers
[ ] GET /suppliers
[ ] GET /inventory

QUERY PARAMETERS:
[ ] branchId - required or optional?
[ ] productGroupId - for filtering items
[ ] itemNumber - for searching items
[ ] Others?

REQUEST BODY FIELDS FOR PUT /items/{id}:
[ ] All fields from GET response required?
[ ] Which fields are read-only?
[ ] Exact field names for stock?
```

## Error Response Analysis

When an error occurs, check:

### In Edge Function Logs
```typescript
console.log(`🌐 FDT API ${method} ${fullUrl}`);
console.log('📤 Request body:', JSON.stringify(body, null, 2));
console.error(`❌ FDT API error (${response.status}): ${errorText}`);
```

### In fdt_sync_log Table
```sql
SELECT 
  created_at,
  sync_type,
  status,
  error_message,
  request_payload,
  response_payload
FROM fdt_sync_log
WHERE status = 'error'
ORDER BY created_at DESC
LIMIT 10;
```

### Common Error Patterns

**"Invalid URL"**
- Likely authentication issue (fixed)
- Or endpoint path wrong

**"Method not allowed"**
- Using POST instead of PUT (FIXED ✅)
- Or API doesn't support that method

**"Bad Request"**
- Request body wrong format
- Missing required fields
- Invalid field values

**"Not Found"**
- Wrong endpoint path
- Resource ID doesn't exist
- Wrong branchId

## Testing Checklist After Deployment

### 1. Stock Update Test
```typescript
// In browser console on Inventory page
const productId = "YOUR_PRODUCT_UUID";
const result = await supabase.functions.invoke('update-sellus-stock', {
  body: { productId, quantity: 0 }
});
console.log('Result:', result);
```

**Expected**: `success: true` with stock updated

### 2. Product Sync Test
```typescript
const result = await supabase.functions.invoke('sync-products-from-sellus');
console.log('Synced:', result.data?.synced);
```

**Expected**: Count > 0 with products synced

### 3. API Explorer Test
1. Navigate to `/fdt-explorer`
2. Test each predefined endpoint
3. Look for any errors
4. Verify response data structure

## Next Actions

1. **Access Swagger UI** at https://stagesellus.fdt.se/12345/api/swagger/index.html
   - Note exact endpoint paths
   - Check required/optional parameters
   - Review request/response schemas
   - Test each endpoint in Swagger UI

2. **Compare Code vs Swagger**
   - Verify endpoint paths match
   - Check query parameter names
   - Ensure request body structure matches
   - Validate HTTP methods are correct

3. **Update Code** based on Swagger findings
   - Fix any wrong endpoint paths
   - Correct parameter names
   - Adjust request body structure
   - Change HTTP methods if needed

4. **Test Thoroughly**
   - Test each endpoint individually
   - Verify error messages are helpful
   - Check edge cases (missing IDs, etc.)
   - Monitor logs for any issues

## Reference

- **Current Fix**: Changed POST to PUT for item updates
- **PR Branch**: `copilot/fix-api-call-errors`
- **Files Modified**: `supabase/functions/update-sellus-stock/index.ts`
- **Status**: Awaiting Swagger verification and testing
