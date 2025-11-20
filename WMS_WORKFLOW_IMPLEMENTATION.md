# WMS Workflow Template Implementation Summary

## Overview
This document describes the implementation of the WMS WORKFLOW TEMPLATE.md specifications for warehouse-handy. The implementation follows the exact 4-step workflow defined in the template for processing delivery notes and article scanning.

## Architecture Changes

### New Edge Function: `process-delivery-item`
Location: `supabase/functions/process-delivery-item/index.ts`

This function implements the complete WMS workflow template with all 4 steps:

#### STEP 1: Get Order ID
- **1a.** Try GET `/orders/{id}` with order reference (Godsmärkning/Märkning/Referens)
- **1b.** Fallback: GET `/items/by-item-number/{itemNumber}` to get item ID
- **1c.** GET `/items/{item-id}/orders?branchId=5` to find active orders
- **1d.** Last resort: Query invoice documents (if order ID available)

#### STEP 2: Update WMS Orders Table
- Creates or updates orders in the local WMS database
- Links delivery note items to orders
- Tracks picked quantities and completion status
- Auto-detects articles starting with "645/0645" as existing stock (befintligt lager)
- Updates order lines with received quantities
- Calculates delivery status: Mottagen, Ej mottagen, Delvis mottagen

#### STEP 3: Get Purchase Order by Cargo Marking
- GET `/purchase-orders?filter=" {reference} "`
- Uses cargo marking (Godsmärkning) to find matching purchase order
- Falls back to order reference if cargo marking not available

#### STEP 4: POST Updated Purchase Order
- **CRITICAL**: Calculates new quantities (NOT "1+1" but "2")
- Updates:
  - `shippedQuantity = currentValue + receivedQuantity`
  - `stockQuantity = currentValue + receivedQuantity`
  - `totalStockQuantity = currentValue + receivedQuantity`
- POST `/purchase-orders/{id}` with updated payload

### Database Changes

#### Migration: `20251120000001_add_workflow_tracking_to_delivery_items.sql`
Added columns to `delivery_note_items`:
- `order_id UUID`: Links to WMS orders table
- `fdt_order_id TEXT`: Tracks FDT Sellus order ID
- Indexes for performance

### Frontend Changes

#### DeliveryNoteScan.tsx
**Changes:**
- Replaced `sync-purchase-order-to-sellus` with `process-delivery-item`
- Added delivery status types and helper functions:
  - `getDeliveryStatus()`: Returns 'mottagen', 'ej_mottagen', or 'delvis_mottagen'
  - `getStatusLabel()`: Returns Swedish labels
- Auto-detects "645/0645" articles as existing stock
- Shows status badges on each item
- Enhanced error messaging with Swedish user-friendly messages
- Status-aware toasts showing delivery state

**Status Indicators:**
```typescript
type DeliveryStatus = 'mottagen' | 'ej_mottagen' | 'delvis_mottagen';

// Status Logic:
- 'ej_mottagen': Item not yet checked
- 'delvis_mottagen': Checked but quantity_checked < quantity_expected
- 'mottagen': Fully received (quantity_checked >= quantity_expected)
```

#### DeliveryNoteDetail.tsx
**Changes:**
- Updated to use new `process-delivery-item` workflow
- Maintains existing quantity difference warnings
- Links articles to orders (already implemented)

#### DeliveryNoteItemCard.tsx
**Existing Features (Maintained):**
- Visual indication of quantity differences (yellow highlight + warning icon)
- Badge showing "Alla produkter ännu inte i lager" when quantities differ
- Shows order numbers and cargo marking
- Editable quantity fields

### Deprecated Functions

#### sync-purchase-order-to-sellus
**Status:** Deprecated but not removed
**Location:** `supabase/functions/sync-purchase-order-to-sellus/index.ts`
**Reason:** Does not follow complete WMS workflow template
**Migration Path:** Use `process-delivery-item` instead

Added deprecation notice:
```typescript
/**
 * DEPRECATED: Use process-delivery-item instead
 * @deprecated Use process-delivery-item for full workflow compliance
 */
```

## Workflow Request/Response Formats

### Request to `process-delivery-item`
```json
{
  "articleNumber": "149216",
  "quantityReceived": 5,
  "orderReference": "ABC123",      // Optional: 5-8 character order reference
  "cargoMarking": "ELON-2024-01",  // Optional: overall cargo marking
  "deliveryNoteId": "uuid",        // Optional: for linking
  "deliveryNoteItemId": "uuid"     // Optional: for tracking
}
```

### Success Response
```json
{
  "success": true,
  "message": "Delivery item processed successfully through full workflow",
  "step": "complete",
  "articleNumber": "149216",
  "quantityReceived": 5,
  "fdtOrderId": "12345",
  "wmsOrderId": "uuid",
  "purchaseOrderId": "67890",
  "quantities": {
    "old": { "shipped": 10, "stock": 15, "totalStock": 15 },
    "new": { "shipped": 15, "stock": 20, "totalStock": 20 }
  },
  "isExistingStock": false,
  "duration_ms": 1234,
  "userMessage": "✅ Artikel 149216 mottagen och synkad till Sellus"
}
```

### Partial Success (No Purchase Order)
```json
{
  "success": true,
  "warning": "No purchase order found with cargo marking: ABC123",
  "step": "step3_purchase_order_not_found",
  "fdtOrderId": "12345",
  "wmsOrderId": "uuid",
  "userMessage": "Artikel registrerad men inköpsorder med godsmärkning \"ABC123\" hittades inte"
}
```

### Error Response
```json
{
  "success": false,
  "error": "No order found for article 149216",
  "step": "step1_order_lookup",
  "userMessage": "Ingen order hittades för denna artikel i Sellus. Kontrollera artikelnummer och ordernummer."
}
```

## Key Features Implemented

### ✅ Completed Features

1. **4-Step Workflow**: Full implementation following template exactly
2. **Order Lookup Fallback Chain**: Reference → Article → Item ID → Orders
3. **WMS Order Tracking**: Local database updates with status tracking
4. **Quantity Calculations**: Proper addition (not "1+1" but calculated totals)
5. **Auto-fill for Existing Stock**: Detects "645/0645" article prefixes
6. **Delivery Status Tracking**: Mottagen, Ej mottagen, Delvis mottagen
7. **Visual Status Indicators**: Color-coded cards and badges
8. **Quantity Difference Warnings**: Yellow highlights when quantities differ
9. **Error Handling**: Comprehensive with user-friendly Swedish messages
10. **Logging**: All operations logged to `fdt_sync_log` table

### 📋 Specification Compliance

#### From WMS WORKFLOW TEMPLATE.md:

✅ **Delivery Notes Workflow**
- Step 1: Get order ID (with fallback chain)
- Step 2: Update WMS orders table
- Step 3: Get purchase order by cargo marking
- Step 4: POST updated purchase order with calculated quantities

✅ **Article Scanning Workflow**
- Same as delivery notes (reuses same function)
- Order reference display when available
- Proper order sorting and display

✅ **Auto-fill Requirements**
- Articles starting with "645/0645" marked as existing stock

✅ **Status Display**
- Mottagen (Received)
- Ej mottagen (Not received)
- Delvis mottagen (Partially received)

✅ **Stock Balance Rules**
- "Stock balance should only be updated when Sellus is changed"
- "If synchronization fails and there is a diff, warn the user"
- Implemented through workflow error handling

✅ **Quantity Differences**
- Mark articles with quantity differences with warning sign
- Display "Alla produkter ej mottagna" message

### 🔄 Not Yet Implemented

The following features from the template are not yet fully implemented:

1. **Följesedlar Tab Enhancements**:
   - ⏳ Digital delivery note backup/import system
   - ⏳ 1-year retention with backup (storage exists but no automated cleanup)
   - ✅ List view with date sorting (already exists)
   - ✅ Clickable delivery notes (already exists)
   - ✅ Article picking status display (already exists)

2. **Order Reference Improvements**:
   - ⏳ Better handling of "Elon Delivery notes" specific format
   - Note: Template mentions "Godsmärkning rad" vs top-level "Godsmärkning"
   - Current implementation uses any provided reference

3. **Scanner.tsx Updates**:
   - ℹ️ Not needed - Scanner is for order picking (outbound), not receiving
   - Template workflow is specifically for receiving (inbound)
   - Current Scanner.tsx behavior is correct for its use case

## Testing Recommendations

### Unit Tests Needed
1. `getDeliveryStatus()` function with various quantity combinations
2. Article number prefix detection ("645", "0645")
3. Quantity calculation logic (ensure "2" not "1+1")

### Integration Tests Needed
1. Full workflow from scan to Sellus update
2. Fallback order lookup chain
3. Error handling for missing orders/purchase orders
4. Quantity difference warning display

### Manual Testing Checklist
- [ ] Scan delivery note with multiple articles
- [ ] Check article with matching quantity
- [ ] Check article with different quantity
- [ ] Verify "645" prefix articles marked as existing stock
- [ ] Test order reference lookup
- [ ] Test cargo marking lookup
- [ ] Verify Sellus purchase order updates
- [ ] Test workflow error scenarios
- [ ] Verify status badges display correctly
- [ ] Check delivery note list view

## Migration Guide

### For Developers

**Old Code:**
```typescript
const { data, error } = await supabase.functions.invoke(
  'sync-purchase-order-to-sellus',
  {
    body: {
      itemNumber: articleNumber,
      quantityReceived: quantity,
      cargoMarking: marking,
    }
  }
);
```

**New Code:**
```typescript
const { data, error } = await supabase.functions.invoke(
  'process-delivery-item',
  {
    body: {
      articleNumber: articleNumber,
      quantityReceived: quantity,
      orderReference: orderRef,     // NEW: specific order reference
      cargoMarking: marking,
      deliveryNoteId: noteId,       // NEW: for tracking
      deliveryNoteItemId: itemId,   // NEW: for linking
    }
  }
);

// Handle new response format
if (data?.success) {
  if (data.skippedPurchaseOrderSync) {
    // Partial success - order updated but not purchase order
  } else if (data.warning) {
    // Success with warnings
  } else {
    // Complete success
  }
}
```

### Database Migration

Run the migration:
```sql
-- Already included in: 20251120000001_add_workflow_tracking_to_delivery_items.sql
ALTER TABLE delivery_note_items 
  ADD COLUMN order_id UUID REFERENCES orders(id),
  ADD COLUMN fdt_order_id TEXT;
```

## Performance Considerations

### API Calls per Workflow
- **Minimum**: 4 API calls (order lookup + item lookup + PO lookup + PO update)
- **Maximum**: 6+ API calls (with fallbacks)
- **Average**: ~5 API calls per article

### Optimization Opportunities
1. **Batch Processing**: Process multiple articles from same delivery note together
2. **Caching**: Cache order lookups within same delivery note session
3. **Parallel Requests**: Some API calls could be parallelized
4. **Purchase Order Batching**: Update multiple articles in single PO update

### Database Performance
- Indexes added for `order_id` and `fdt_order_id` lookups
- Consider adding composite index on `(delivery_note_id, article_number)`

## Security Considerations

1. **Authentication**: All edge functions require valid Supabase authentication
2. **RLS Policies**: Delivery notes and items protected by Row Level Security
3. **API Keys**: FDT Sellus API key stored securely in environment variables
4. **Error Messages**: User-friendly messages don't expose internal details
5. **Logging**: Sensitive data not logged (API keys, etc.)

## Monitoring and Logging

### Sync Logs
All workflow operations logged to `fdt_sync_log` table:
```sql
SELECT * FROM fdt_sync_log 
WHERE sync_type = 'delivery_item_workflow'
ORDER BY created_at DESC;
```

### Metrics to Monitor
- Success rate per step (step1_order_lookup, step2_complete, etc.)
- Average workflow duration
- Most common error types
- Articles requiring fallback lookups
- Partial success rate (order updated but not PO)

### Error Patterns
- `step1_order_lookup`: No order found - may indicate missing data in Sellus
- `step3_purchase_order_not_found`: Missing cargo marking or wrong reference
- `step4_purchase_order_update_failed`: Sellus API issues

## Future Enhancements

1. **Batch Processing**: Handle multiple articles from same delivery note in one workflow call
2. **Offline Support**: Queue operations when Sellus API unavailable
3. **Undo Functionality**: Reverse workflow steps if needed
4. **Enhanced Reporting**: Analytics on delivery note processing times
5. **Mobile Optimization**: Further optimize for warehouse handheld devices
6. **Barcode Scanning**: Direct barcode scanner hardware integration
7. **Voice Commands**: Hands-free operation for warehouse workers

## Support and Troubleshooting

### Common Issues

**Issue**: "No order found for article"
- **Cause**: Article not in Sellus or incorrect article number
- **Solution**: Verify article number, check Sellus directly

**Issue**: "No purchase order found with cargo marking"
- **Cause**: Wrong cargo marking or PO doesn't exist
- **Solution**: Check delivery note for correct marking, verify in Sellus

**Issue**: "Failed to update purchase order"
- **Cause**: Sellus API error or invalid data
- **Solution**: Check `fdt_sync_log` for details, may need manual update in Sellus

### Debug Mode

Enable detailed logging by checking edge function logs:
```bash
supabase functions logs process-delivery-item
```

Look for log entries starting with:
- `📦 STARTING WMS WORKFLOW TEMPLATE`
- `🔍 STEP 1:` through `STEP 4:`
- `✅` for successes, `❌` for errors

## Conclusion

The WMS Workflow Template has been successfully implemented following the exact specifications. The system now provides:

- ✅ Complete 4-step workflow compliance
- ✅ Robust error handling and user feedback
- ✅ Automatic stock detection
- ✅ Status tracking and visualization
- ✅ Comprehensive logging
- ✅ Backward compatibility (deprecated functions kept)

The implementation prioritizes data integrity, user experience, and maintainability while following the template precisely.
