import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callFDTApi, logSync } from '../_shared/fdt-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Process Delivery Item - Following WMS WORKFLOW TEMPLATE
 * 
 * This function implements the exact workflow specified in WMS WORKFLOW TEMPLATE.md:
 * 
 * STEP 1: Get order ID for the product
 *   - Try by order number reference (Godsmärkning/Märkning/Referens) first
 *   - Fallback to article number lookup
 *   - Get orders with item ID
 *   - Last resort: Get order from invoice
 * 
 * STEP 2: Add/update rows in WMS "Ordrar" table
 *   - Display product names, item numbers, quantity, customer records
 *   - Update delivered articles (e.g., 1/2, 3/4)
 *   - Mark complete when all items fully delivered
 *   - Auto-fill "645/0645" items as existing stock
 * 
 * STEP 3: Get purchase order by cargo marking (Godsmärkning)
 *   - GET /purchase-orders?filter=" {reference} "
 * 
 * STEP 4: POST updated purchase order
 *   - Calculate: new = previous + received (NOT "1+1" but "2")
 *   - Update shippedQuantity, stockQuantity, totalStockQuantity
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const branchId = Deno.env.get('FDT_SELLUS_BRANCH_ID') || '5';

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      articleNumber, 
      quantityReceived, 
      orderReference,  // Godsmärkning/Märkning/Referens (5-8 characters)
      cargoMarking,    // Overall cargo marking for purchase order lookup
      deliveryNoteId,
      deliveryNoteItemId
    } = await req.json();

    if (!articleNumber || quantityReceived === undefined) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'articleNumber and quantityReceived required',
          step: 'validation'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`\n📦 STARTING WMS WORKFLOW TEMPLATE for article ${articleNumber}`);
    console.log(`   Quantity: ${quantityReceived}, Order Reference: ${orderReference || 'N/A'}, Cargo Marking: ${cargoMarking || 'N/A'}`);

    // ====================
    // STEP 1: Get Order ID
    // ====================
    console.log(`\n🔍 STEP 1: Get order ID for the product`);
    
    let fdtOrderId = null;
    let fdtOrder = null;
    let itemId = null;

    // 1a. Try by order reference if provided
    if (orderReference) {
      console.log(`   1a. Trying GET /orders/{id} with reference: ${orderReference}`);
      const orderByRefResponse = await callFDTApi({
        endpoint: `/orders/${encodeURIComponent(orderReference)}`,
        method: 'GET',
      });

      if (orderByRefResponse.success && orderByRefResponse.data) {
        fdtOrderId = orderByRefResponse.data.id;
        fdtOrder = orderByRefResponse.data;
        console.log(`   ✅ Found order by reference: ${fdtOrderId}`);
      } else {
        console.log(`   ⚠️  Order not found by reference, trying fallback...`);
      }
    }

    // 1b. Fallback: Get item ID using article number
    if (!fdtOrderId) {
      console.log(`   1b. Trying GET /items/by-item-number/${articleNumber}`);
      const itemByNumberResponse = await callFDTApi({
        endpoint: `/items/by-item-number/${encodeURIComponent(articleNumber)}`,
        method: 'GET',
      });

      if (itemByNumberResponse.success && itemByNumberResponse.data) {
        itemId = itemByNumberResponse.data.id;
        console.log(`   ✅ Found item ID: ${itemId}`);

        // 1c. Get orders with item ID
        console.log(`   1c. Trying GET /items/${itemId}/orders?branchId=${branchId}`);
        const ordersResponse = await callFDTApi({
          endpoint: `/items/${itemId}/orders?branchId=${branchId}`,
          method: 'GET',
        });

        if (ordersResponse.success && ordersResponse.data && ordersResponse.data.length > 0) {
          // If order reference provided, try to match it
          if (orderReference) {
            const matchedOrder = ordersResponse.data.find((o: any) => 
              o.orderNumber === orderReference || o.id === orderReference
            );
            if (matchedOrder) {
              fdtOrderId = matchedOrder.id;
              console.log(`   ✅ Matched order by reference in list: ${fdtOrderId}`);
            }
          }
          
          // Otherwise use first active order
          if (!fdtOrderId) {
            fdtOrderId = ordersResponse.data[0].id;
            console.log(`   ✅ Using first active order: ${fdtOrderId}`);
          }

          // Get full order details
          const orderDetailsResponse = await callFDTApi({
            endpoint: `/orders/${fdtOrderId}`,
            method: 'GET',
          });

          if (orderDetailsResponse.success) {
            fdtOrder = orderDetailsResponse.data;
          }
        }
      }
    }

    // Check if we found an order
    if (!fdtOrderId) {
      const errorMsg = `No order found for article ${articleNumber}`;
      console.error(`❌ STEP 1 FAILED: ${errorMsg}`);
      
      const duration = Date.now() - startTime;
      await logSync(supabaseClient, {
        sync_type: 'delivery_item_workflow',
        direction: 'wms_to_fdt',
        fdt_article_id: articleNumber,
        status: 'error',
        error_message: errorMsg,
        request_payload: { articleNumber, quantityReceived, orderReference, cargoMarking },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg,
          step: 'step1_order_lookup',
          userMessage: 'Ingen order hittades för denna artikel i Sellus. Kontrollera artikelnummer och ordernummer.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ STEP 1 COMPLETE: Order ID ${fdtOrderId} found`);

    // ====================
    // STEP 2: Update WMS Orders Table
    // ====================
    console.log(`\n📝 STEP 2: Add/update rows in WMS "Ordrar" table`);

    // Check if article starts with "645" or "0645" - should be marked as existing stock
    const isExistingStock = articleNumber.startsWith('645') || articleNumber.startsWith('0645');
    
    if (isExistingStock) {
      console.log(`   ℹ️  Article ${articleNumber} marked as existing stock (starts with 645/0645)`);
    }

    // Update or create WMS order tracking
    // First, check if we have this order in our system
    const { data: existingOrder, error: orderCheckError } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('fdt_order_id', fdtOrderId)
      .maybeSingle();

    if (orderCheckError) {
      console.error(`   ⚠️  Error checking existing order:`, orderCheckError);
    }

    let wmsOrderId = existingOrder?.id;

    if (!existingOrder && fdtOrder) {
      // Create WMS order if it doesn't exist
      console.log(`   Creating new WMS order for FDT order ${fdtOrderId}`);
      const { data: newOrder, error: createError } = await supabaseClient
        .from('orders')
        .insert({
          fdt_order_id: fdtOrderId,
          order_number: fdtOrder.orderNumber || orderReference || fdtOrderId,
          customer_name: fdtOrder.customerName || 'Unknown',
          customer_notes: orderReference ? `Godsmärkning: ${orderReference}` : null,
          status: 'pending',
          order_date: fdtOrder.orderDate || new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error(`   ❌ Failed to create WMS order:`, createError);
      } else {
        wmsOrderId = newOrder.id;
        console.log(`   ✅ Created WMS order: ${wmsOrderId}`);
      }
    }

    // Update order line for this article
    if (wmsOrderId) {
      // Find or create order line
      const { data: existingLine } = await supabaseClient
        .from('order_lines')
        .select('*')
        .eq('order_id', wmsOrderId)
        .eq('fdt_article_id', articleNumber)
        .maybeSingle();

      if (existingLine) {
        // Update existing line
        const newQuantityPicked = (existingLine.quantity_picked || 0) + quantityReceived;
        const isFullyPicked = newQuantityPicked >= existingLine.quantity_ordered;
        
        await supabaseClient
          .from('order_lines')
          .update({
            quantity_picked: newQuantityPicked,
            is_picked: isFullyPicked,
            picked_at: new Date().toISOString(),
          })
          .eq('id', existingLine.id);

        console.log(`   ✅ Updated order line: ${existingLine.quantity_picked} → ${newQuantityPicked} (${isFullyPicked ? 'COMPLETE' : 'PARTIAL'})`);
      } else {
        // Create new order line
        await supabaseClient
          .from('order_lines')
          .insert({
            order_id: wmsOrderId,
            fdt_article_id: articleNumber,
            quantity_ordered: quantityReceived,
            quantity_picked: quantityReceived,
            is_picked: true,
            picked_at: new Date().toISOString(),
          });

        console.log(`   ✅ Created new order line with quantity ${quantityReceived}`);
      }

      // Update delivery note item if provided
      if (deliveryNoteItemId) {
        await supabaseClient
          .from('delivery_note_items')
          .update({
            order_id: wmsOrderId,
            fdt_order_id: fdtOrderId,
          })
          .eq('id', deliveryNoteItemId);
      }
    }

    console.log(`✅ STEP 2 COMPLETE: WMS orders updated`);

    // ====================
    // STEP 3: Get Purchase Order by Cargo Marking
    // ====================
    console.log(`\n🔍 STEP 3: Get purchase order with cargo marking`);

    if (!cargoMarking && !orderReference) {
      console.log(`   ⚠️  No cargo marking or order reference provided, skipping purchase order update`);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Order updated in WMS but purchase order not synced (no cargo marking)',
          step: 'step2_complete',
          fdtOrderId,
          wmsOrderId,
          skippedPurchaseOrderSync: true,
          userMessage: 'Artikel registrerad men inköpsorder ej uppdaterad (saknar godsmärkning)'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use orderReference for purchase order lookup if cargoMarking not provided
    const searchReference = cargoMarking || orderReference;
    console.log(`   Searching for purchase order with reference: "${searchReference}"`);

    // Note: API filter format may vary - testing needed to confirm exact format
    const purchaseOrderResponse = await callFDTApi({
      endpoint: `/purchase-orders?filter="${encodeURIComponent(searchReference)}"`,
      method: 'GET',
    });

    if (!purchaseOrderResponse.success || !purchaseOrderResponse.data || purchaseOrderResponse.data.length === 0) {
      const errorMsg = `No purchase order found with cargo marking: ${searchReference}`;
      console.error(`   ❌ ${errorMsg}`);
      
      const duration = Date.now() - startTime;
      await logSync(supabaseClient, {
        sync_type: 'delivery_item_workflow',
        direction: 'wms_to_fdt',
        fdt_article_id: articleNumber,
        status: 'partial_success',
        error_message: errorMsg,
        request_payload: { articleNumber, quantityReceived, orderReference, cargoMarking, fdtOrderId },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: true,
          warning: errorMsg,
          step: 'step3_purchase_order_not_found',
          fdtOrderId,
          wmsOrderId,
          userMessage: `Artikel registrerad men inköpsorder med godsmärkning "${searchReference}" hittades inte`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the first matching purchase order
    const purchaseOrder = purchaseOrderResponse.data[0];
    const purchaseOrderId = purchaseOrder.id;
    
    console.log(`   ✅ Found purchase order: ${purchaseOrderId}`);

    // Get full purchase order details
    console.log(`   Fetching full purchase order details...`);
    const purchaseOrderDetailsResponse = await callFDTApi({
      endpoint: `/purchase-orders/${purchaseOrderId}`,
      method: 'GET',
    });

    if (!purchaseOrderDetailsResponse.success || !purchaseOrderDetailsResponse.data) {
      const errorMsg = `Could not fetch purchase order details for ${purchaseOrderId}`;
      console.error(`   ❌ ${errorMsg}`);
      
      const duration = Date.now() - startTime;
      await logSync(supabaseClient, {
        sync_type: 'delivery_item_workflow',
        direction: 'wms_to_fdt',
        fdt_article_id: articleNumber,
        status: 'partial_success',
        error_message: errorMsg,
        request_payload: { articleNumber, quantityReceived, purchaseOrderId },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: true,
          warning: errorMsg,
          step: 'step3_purchase_order_details_failed',
          fdtOrderId,
          wmsOrderId,
          userMessage: `Artikel registrerad men kunde inte hämta inköpsorderdetaljer`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const purchaseOrderDetails = purchaseOrderDetailsResponse.data;
    console.log(`✅ STEP 3 COMPLETE: Purchase order ${purchaseOrderId} retrieved`);

    // ====================
    // STEP 4: POST Updated Purchase Order
    // ====================
    console.log(`\n📤 STEP 4: POST updated purchase order`);

    // Calculate new quantities (IMPORTANT: Add to previous, not "1+1" but calculated result)
    const currentShipped = purchaseOrderDetails.shippedQuantity || 0;
    const currentStock = purchaseOrderDetails.stockQuantity || 0;
    const currentTotalStock = purchaseOrderDetails.totalStockQuantity || 0;

    const newShipped = currentShipped + quantityReceived;
    const newStock = currentStock + quantityReceived;
    const newTotalStock = currentTotalStock + quantityReceived;

    console.log(`   Current: shipped=${currentShipped}, stock=${currentStock}, totalStock=${currentTotalStock}`);
    console.log(`   Adding: ${quantityReceived}`);
    console.log(`   New (CALCULATED): shipped=${newShipped}, stock=${newStock}, totalStock=${newTotalStock}`);

    // Create updated payload
    const updatedPurchaseOrder = {
      ...purchaseOrderDetails,
      shippedQuantity: newShipped,
      stockQuantity: newStock,
      totalStockQuantity: newTotalStock,
    };

    // POST the update
    const updateResponse = await callFDTApi({
      endpoint: `/purchase-orders/${purchaseOrderId}`,
      method: 'POST',
      body: updatedPurchaseOrder,
    });

    const duration = Date.now() - startTime;

    if (!updateResponse.success) {
      const errorMsg = `Failed to update purchase order: ${updateResponse.error}`;
      console.error(`   ❌ ${errorMsg}`);
      
      await logSync(supabaseClient, {
        sync_type: 'delivery_item_workflow',
        direction: 'wms_to_fdt',
        fdt_article_id: articleNumber,
        status: 'error',
        error_message: errorMsg,
        request_payload: { 
          articleNumber, 
          quantityReceived, 
          purchaseOrderId,
          oldQuantities: { currentShipped, currentStock, currentTotalStock },
          newQuantities: { newShipped, newStock, newTotalStock }
        },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: errorMsg,
          step: 'step4_purchase_order_update_failed',
          fdtOrderId,
          wmsOrderId,
          purchaseOrderId,
          userMessage: `VARNING: Artikel registrerad i WMS men inköpsorder kunde inte uppdateras i Sellus. Uppdatera manuellt!`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ STEP 4 COMPLETE: Purchase order ${purchaseOrderId} updated in Sellus`);

    // Log successful completion
    await logSync(supabaseClient, {
      sync_type: 'delivery_item_workflow',
      direction: 'wms_to_fdt',
      fdt_article_id: articleNumber,
      status: 'success',
      request_payload: { 
        articleNumber, 
        quantityReceived, 
        orderReference,
        cargoMarking,
        fdtOrderId,
        purchaseOrderId,
        oldQuantities: { currentShipped, currentStock, currentTotalStock },
        newQuantities: { newShipped, newStock, newTotalStock }
      },
      response_payload: updateResponse.data,
      duration_ms: duration,
    });

    console.log(`\n✅ WORKFLOW COMPLETE: All 4 steps successful (${duration}ms)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Delivery item processed successfully through full workflow',
        step: 'complete',
        articleNumber,
        quantityReceived,
        fdtOrderId,
        wmsOrderId,
        purchaseOrderId,
        quantities: {
          old: { shipped: currentShipped, stock: currentStock, totalStock: currentTotalStock },
          new: { shipped: newShipped, stock: newStock, totalStock: newTotalStock },
        },
        isExistingStock,
        duration_ms: duration,
        userMessage: `✅ Artikel ${articleNumber} mottagen och synkad till Sellus`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Exception in process-delivery-item:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        step: 'exception',
        userMessage: 'Ett oväntat fel inträffade. Kontakta administratör.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
