# Sync Purchase Order to Sellus

This edge function syncs new stock receipts to Sellus by updating purchase order quantities.

## Overview

When receiving stock via delivery notes (följesedlar), this function:
1. Fetches the internal item ID using the article number
2. Retrieves purchase orders for that item
3. Matches the correct purchase order by cargo marking (godsmärkning)
4. Updates the purchase order with new received quantities

## API Workflow

The function follows this exact sequence as specified in the requirements:

1. **GET /items/by-item-number/{itemNumber}** - Get internal ID for the product
2. **GET /items/{item-id}/orders?branchId=5** - Get order IDs with item ID
3. **GET /purchase-orders/{id}** - Get purchase order details
4. **POST /purchase-orders/{id}** - Update the purchase order with new quantities

## Request Body

```json
{
  "itemNumber": "ART-12345",
  "quantityReceived": 10,
  "cargoMarking": "GODS-001"
}
```

### Parameters

- `itemNumber` (string, required): The article number / artikelnummer from the packing slip
- `quantityReceived` (number, required): The quantity received (can be manually edited by user)
- `cargoMarking` (string, optional): The cargo marking / godsmärkning to match the correct purchase order

## Response

### Success Response (200)

```json
{
  "success": true,
  "message": "Purchase order updated successfully",
  "itemId": "12345",
  "itemNumber": "ART-12345",
  "orderId": "67890",
  "cargoMarking": "GODS-001",
  "quantityAdded": 10,
  "oldQuantities": {
    "shippedQuantity": 5,
    "stockQuantity": 5,
    "totalStockQuantity": 5
  },
  "newQuantities": {
    "shippedQuantity": 15,
    "stockQuantity": 15,
    "totalStockQuantity": 15
  }
}
```

### Error Responses

- **404**: Item, order, or purchase order not found
- **400**: Missing required parameters or invalid data
- **500**: Server error or Sellus API failure

## Quantity Calculations

The function calculates new quantities by **adding** the received amount to existing values:

```
newShippedQuantity = currentShippedQuantity + quantityReceived
newStockQuantity = currentStockQuantity + quantityReceived
newTotalStockQuantity = currentTotalStockQuantity + quantityReceived
```

Example:
- Current: shippedQuantity = 5
- Received: quantityReceived = 10
- Result: shippedQuantity = 15 (NOT "5+10" but the calculated value "15")

## Cargo Marking Matching

If a cargo marking is provided, the function searches for a purchase order where the `note` field contains the cargo marking. This allows matching the correct order when multiple purchase orders exist for the same item.

If no cargo marking is provided, the function uses the first available purchase order.

## Usage in Application

This function is automatically called when:
- A user checks off an item in a delivery note (DeliveryNoteScan page)
- A user checks off an item in the delivery note detail view (DeliveryNoteDetail page)

The user can edit the quantity before checking it off, and the edited quantity will be synced to Sellus. Items with edited quantities are marked with a warning indicator (yellow background + badge).

## Logging

All sync operations are logged to the `fdt_sync_log` table with:
- Sync type: 'purchase_order'
- Direction: 'wms_to_fdt'
- Status: 'success' or 'error'
- Request/response payloads
- Duration in milliseconds

## Environment Variables

Required environment variables:
- `FDT_SELLUS_BASE_URL`: Base URL for the Sellus API
- `FDT_SELLUS_API_KEY`: API key for authentication
- `FDT_SELLUS_BRANCH_ID`: Branch ID to use (defaults to "5")
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key

## Error Handling

The function includes comprehensive error handling:
- Returns descriptive error messages
- Logs all operations for audit trail
- Handles API failures gracefully
- Supports multiple authentication strategies for the FDT API

## Security

- Requires valid JWT authentication token in the Authorization header
- Uses service role key for database operations
- Validates all input parameters
- Sanitizes error messages before returning to client
