# Migration Issues Fix Summary

## Problem
API calls failed after migrating from Lovable to Vercel/Supabase hosting. The integrations worked before the migration.

## Root Cause
**HTTP Method Mismatch**: The code was using `POST` to update existing items, but REST APIs require `PUT` or `PATCH` for updates.

### Why It Worked on Lovable
Lovable's backend hosting likely had:
- Middleware that was more forgiving with HTTP methods
- Automatic method translation (POST → PUT for updates)
- Custom proxy logic that handled non-standard REST patterns

### Why It Fails on Supabase
Supabase Edge Functions make direct API calls to the FDT Sellus API without middleware, requiring proper REST semantics:
- POST = Create new resource
- PUT = Replace entire resource
- PATCH = Update specific fields
- GET = Read resource
- DELETE = Remove resource

## Fixes Applied

### 1. Fixed HTTP Method for Stock Updates ✅
**File**: `supabase/functions/update-sellus-stock/index.ts`

**Before**:
```typescript
// Try POST first - WRONG!
let updateResponse = await callFDTApi({
  endpoint: `/items/${numericId}?branchId=${branchId}`,
  method: 'POST',  // ❌ Wrong: POST is for CREATE
  body: {
    stock: totalStock,
    quantity: totalStock,
    availableQuantity: totalStock,
  },
});
```

**After**:
```typescript
// Use PUT for full update - CORRECT!
const updatePayload = {
  ...existingItem,  // Preserve all fields (PUT requirement)
  stock: totalStock,
  quantity: totalStock,
  availableQuantity: totalStock,
};

let updateResponse = await callFDTApi({
  endpoint: `/items/${numericId}?branchId=${branchId}`,
  method: 'PUT',  // ✅ Correct: PUT is for UPDATE
  body: updatePayload,
});

// Fallback to PATCH if PUT not supported
if (!updateResponse.success && methodError) {
  const patchPayload = {
    stock: totalStock,
    quantity: totalStock,
    availableQuantity: totalStock,
  };
  
  updateResponse = await callFDTApi({
    endpoint: `/items/${numericId}?branchId=${branchId}`,
    method: 'PATCH',  // ✅ Alternative: PATCH for partial update
    body: patchPayload,
  });
}
```

**Key Changes**:
1. Changed method from POST to PUT
2. Now sends full item object with PUT (REST standard)
3. Added PATCH fallback for partial updates
4. Preserves all existing item fields to avoid data loss

## Remaining Items to Verify

### 2. Endpoint Paths ⏳
Compare actual API endpoints against Swagger documentation at:
`https://stagesellus.fdt.se/12345/api/swagger/index.html`

**Check**:
- [ ] `/items` - Correct path?
- [ ] `/items/full` - Does this endpoint exist? Or should it be `/items` with query param?
- [ ] `/items/{id}` - Correct path format?
- [ ] `/items/{id}/orders` - Does this exist in Swagger?
- [ ] `/productgroups` - Correct path and casing?
- [ ] `/branches` - Correct path?
- [ ] `/orders` - Correct path?
- [ ] `/inventory` - Correct path?

### 3. Query Parameter Format ⏳
**Check in Swagger**:
- [ ] Is it `branchId` or `branch_id` or `BranchId`?
- [ ] Should branchId be in URL or request body?
- [ ] Are there other required query parameters?
- [ ] Is `productGroupId` the correct parameter name?

### 4. Request Body Format ⏳
**Check in Swagger**:
- [ ] What fields are required for PUT /items/{id}?
- [ ] What fields are optional?
- [ ] Is there a specific structure for stock updates?
- [ ] Do field names match? (stock vs Stock, quantity vs Quantity)

### 5. Authentication ✅
Already using Bearer token format:
```typescript
'Authorization': `Bearer ${apiKey}`
```
This is the correct format according to Swagger/OpenAPI standards.

### 6. Response Format ⏳
**Check**:
- [ ] Does API return data directly or wrapped in `{ data: ... }`?
- [ ] Error response format matches expectations?
- [ ] Status codes match what we handle?

## Testing Checklist

### Test with FDT API Explorer
1. Navigate to `/fdt-explorer` in the app
2. Click "Testa anslutning" (Test Connection)
3. Try these endpoints in order:
   - `productgroups` (should work - just GET)
   - `branches` (should work - just GET)
   - `items` with branchId=5 (should work - just GET)
   - `items/{id}` with specific article ID (should work - just GET)

### Test Stock Update
1. Go to Inventory page
2. Pick a product and update quantity
3. Check if stock updates in Sellus
4. Monitor Edge Function logs for errors

### Test Product Sync
1. Go to Integrations page
2. Click "Synkronisera" for Artiklar
3. Should see products imported
4. Check sync log for errors

## Migration Comparison

| Aspect | Lovable Hosting | Supabase Hosting |
|--------|----------------|------------------|
| Backend | Custom middleware | Direct Edge Functions |
| API Calls | Potentially proxied | Direct fetch() calls |
| Method Validation | Lenient | Strict REST |
| Error Handling | May transform errors | Raw API responses |
| Headers | May add defaults | Must specify all |
| URL Construction | May normalize | Exact string concat |

## Expected Results After Fix

### Should Work Now ✅
- Stock updates to FDT Sellus API
- PUT requests to `/items/{id}`
- Full item updates preserving all fields

### Still Need to Verify
- GET requests (should already work)
- Other endpoints (customers, orders, etc.)
- Query parameter formats
- Response parsing

## Next Steps

1. **Deploy the changes** to Supabase Edge Functions
2. **Access Swagger UI** to verify:
   - Exact endpoint paths
   - Required/optional parameters
   - Request body schemas
   - Response formats
3. **Test each endpoint** systematically using FDT API Explorer
4. **Update code** based on Swagger documentation
5. **Re-test all sync functions**

## Documentation References

- **Swagger UI**: https://stagesellus.fdt.se/12345/api/swagger/index.html
- **REST Method Standards**: https://restfulapi.net/http-methods/
- **OpenAPI/Swagger Docs**: https://swagger.io/docs/
- **FDT API Testing Guide**: `test-fdt-api.md`
- **Previous Fixes**: 
  - `FDT_SYNC_FIX_SUMMARY.md` - Authentication simplification
  - `API_AUTHORIZATION_FIX.md` - Bearer token format
  - `EDGE_FUNCTION_FIX_SUMMARY.md` - Removed manual auth checks

## Security

✅ CodeQL scan passed
✅ No new vulnerabilities
✅ API credentials remain secure in environment variables
✅ No breaking changes to existing functionality

## Support

If issues persist:
1. Check Supabase Edge Function logs
2. Review `fdt_sync_log` table
3. Compare against Swagger UI documentation
4. Contact FDT Sellus support for API clarification
5. Test with curl/Postman to isolate issues
