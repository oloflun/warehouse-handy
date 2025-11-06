import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callFDTApi, logSync } from '../_shared/fdt-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify JWT token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized - missing authorization header' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const startTime = Date.now();
  const branchId = Deno.env.get('FDT_SELLUS_BRANCH_ID') || '5';

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { itemNumber, quantityReceived, cargoMarking } = await req.json();

    if (!itemNumber || quantityReceived === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: 'itemNumber and quantityReceived required' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Syncing purchase order to Sellus for item ${itemNumber}, quantity: ${quantityReceived}, cargo marking: ${cargoMarking || 'N/A'}`);

    // Step 1: Get internal id for the product using the item number
    console.log(`🔍 Step 1: Fetching item by item number: ${itemNumber}`);
    const itemByNumberResponse = await callFDTApi({
      endpoint: `/items/by-item-number/${encodeURIComponent(itemNumber)}`,
      method: 'GET',
    });

    if (!itemByNumberResponse.success || !itemByNumberResponse.data) {
      const errorMsg = `Item not found with item number: ${itemNumber}`;
      console.error(`❌ ${errorMsg}`);
      
      const duration = Date.now() - startTime;
      await logSync(supabaseClient, {
        sync_type: 'purchase_order',
        direction: 'wms_to_fdt',
        fdt_article_id: itemNumber,
        status: 'error',
        error_message: errorMsg,
        request_payload: { itemNumber, quantityReceived, cargoMarking },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg,
          details: itemByNumberResponse.error
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const itemId = itemByNumberResponse.data.id;
    console.log(`✅ Found item ID: ${itemId}`);

    // Step 2: Get order id with item id
    console.log(`🔍 Step 2: Fetching orders for item ${itemId} at branch ${branchId}`);
    const ordersResponse = await callFDTApi({
      endpoint: `/items/${itemId}/orders?branchId=${branchId}`,
      method: 'GET',
    });

    if (!ordersResponse.success || !ordersResponse.data || ordersResponse.data.length === 0) {
      const errorMsg = `No orders found for item ${itemId} at branch ${branchId}`;
      console.error(`❌ ${errorMsg}`);
      
      const duration = Date.now() - startTime;
      await logSync(supabaseClient, {
        sync_type: 'purchase_order',
        direction: 'wms_to_fdt',
        fdt_article_id: itemNumber,
        status: 'error',
        error_message: errorMsg,
        request_payload: { itemNumber, itemId, quantityReceived, cargoMarking, branchId },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg,
          details: ordersResponse.error
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orders = ordersResponse.data;
    console.log(`✅ Found ${orders.length} order(s) for item`);

    // Step 3: Get purchase order with purchase order id and match by cargo marking (note/godsmärkning)
    let matchingOrder = null;
    let matchingOrderDetails = null;

    for (const order of orders) {
      const orderId = order.id;
      console.log(`🔍 Step 3: Fetching purchase order ${orderId}`);
      
      const purchaseOrderResponse = await callFDTApi({
        endpoint: `/purchase-orders/${orderId}`,
        method: 'GET',
      });

      if (purchaseOrderResponse.success && purchaseOrderResponse.data) {
        const orderData = purchaseOrderResponse.data;
        
        // Match by cargo marking (note) if provided
        if (cargoMarking && orderData.note && orderData.note.includes(cargoMarking)) {
          matchingOrder = order;
          matchingOrderDetails = orderData;
          console.log(`✅ Found matching purchase order by cargo marking: ${orderId}`);
          break;
        } else if (!cargoMarking) {
          // If no cargo marking specified, use the first order
          matchingOrder = order;
          matchingOrderDetails = orderData;
          console.log(`✅ Using purchase order (no cargo marking filter): ${orderId}`);
          break;
        }
      }
    }

    if (!matchingOrder || !matchingOrderDetails) {
      const errorMsg = cargoMarking 
        ? `No purchase order found with cargo marking: ${cargoMarking}`
        : `Could not fetch purchase order details`;
      console.error(`❌ ${errorMsg}`);
      
      const duration = Date.now() - startTime;
      await logSync(supabaseClient, {
        sync_type: 'purchase_order',
        direction: 'wms_to_fdt',
        fdt_article_id: itemNumber,
        status: 'error',
        error_message: errorMsg,
        request_payload: { itemNumber, itemId, quantityReceived, cargoMarking, branchId },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Update the purchase order with new quantities
    const orderId = matchingOrder.id;
    const currentShippedQuantity = matchingOrderDetails.shippedQuantity || 0;
    const currentStockQuantity = matchingOrderDetails.stockQuantity || 0;
    const currentTotalStockQuantity = matchingOrderDetails.totalStockQuantity || 0;

    console.log(`📊 Current quantities - Shipped: ${currentShippedQuantity}, Stock: ${currentStockQuantity}, Total Stock: ${currentTotalStockQuantity}`);
    console.log(`📦 Adding received quantity: ${quantityReceived}`);

    // Calculate new quantities
    const newShippedQuantity = currentShippedQuantity + quantityReceived;
    const newStockQuantity = currentStockQuantity + quantityReceived;
    const newTotalStockQuantity = currentTotalStockQuantity + quantityReceived;

    console.log(`📊 New quantities - Shipped: ${newShippedQuantity}, Stock: ${newStockQuantity}, Total Stock: ${newTotalStockQuantity}`);

    // Create updated purchase order payload
    const updatedOrderPayload = {
      ...matchingOrderDetails,
      shippedQuantity: newShippedQuantity,
      stockQuantity: newStockQuantity,
      totalStockQuantity: newTotalStockQuantity,
    };

    console.log(`📤 Updating purchase order ${orderId}`);
    
    const updateResponse = await callFDTApi({
      endpoint: `/purchase-orders/${orderId}`,
      method: 'POST',
      body: updatedOrderPayload,
    });

    const duration = Date.now() - startTime;

    if (updateResponse.success) {
      console.log(`✅ Successfully updated purchase order ${orderId}`);
      
      await logSync(supabaseClient, {
        sync_type: 'purchase_order',
        direction: 'wms_to_fdt',
        fdt_article_id: itemNumber,
        status: 'success',
        request_payload: { 
          itemNumber, 
          itemId, 
          orderId,
          quantityReceived, 
          cargoMarking, 
          branchId,
          oldQuantities: {
            shippedQuantity: currentShippedQuantity,
            stockQuantity: currentStockQuantity,
            totalStockQuantity: currentTotalStockQuantity,
          },
          newQuantities: {
            shippedQuantity: newShippedQuantity,
            stockQuantity: newStockQuantity,
            totalStockQuantity: newTotalStockQuantity,
          }
        },
        response_payload: updateResponse.data,
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Purchase order updated successfully`,
          itemId,
          itemNumber,
          orderId,
          cargoMarking: matchingOrderDetails.note,
          quantityAdded: quantityReceived,
          oldQuantities: {
            shippedQuantity: currentShippedQuantity,
            stockQuantity: currentStockQuantity,
            totalStockQuantity: currentTotalStockQuantity,
          },
          newQuantities: {
            shippedQuantity: newShippedQuantity,
            stockQuantity: newStockQuantity,
            totalStockQuantity: newTotalStockQuantity,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.error('Failed to update purchase order in Sellus:', updateResponse.error);

      await logSync(supabaseClient, {
        sync_type: 'purchase_order',
        direction: 'wms_to_fdt',
        fdt_article_id: itemNumber,
        status: 'error',
        error_message: updateResponse.error,
        request_payload: { 
          itemNumber, 
          itemId, 
          orderId,
          quantityReceived, 
          cargoMarking, 
          branchId 
        },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to update purchase order in Sellus',
          details: updateResponse.error 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Exception in sync-purchase-order-to-sellus:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
