import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { callFDTApi, logSync } from '../_shared/fdt-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`🔄 Fetching all orders (retail + e-commerce) for Elon branch (branchId=5)...`);

    // Filter for Elon branch only (branchId=5)
    // Note: No time filter - fetches all orders to catch long-pending orders
    const result = await callFDTApi({
      endpoint: `/orders?branchId=5`,
      method: 'GET',
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Robust parsing of orders array
    const payload = result.data || {};
    const orders = Array.isArray(payload)
      ? payload
      : payload.results || payload.orders || payload.data || [];
    
    console.log('🔍 FDT payload keys:', Object.keys(payload));
    console.log('🔍 First item sample:', Array.isArray(orders) && orders[0] ? JSON.stringify(orders[0]).substring(0, 200) : 'none');
    console.log(`📦 Found ${orders.length} orders to process`);
    
    // Simplified status filtering - exclude only non-paid orders
    const excludedTypes = ['quote', 'offer', 'draft'];
    const excludedStatuses = ['cancelled', 'rejected', 'expired', 'deleted'];
    
    const validOrders = orders.filter((order: any) => {
      const orderType = (order.type || order.orderType || '').toLowerCase();
      const orderStatus = (order.status || order.orderStatus || '').toLowerCase();
      
      // Exclude only quotes/offers and cancelled orders
      const isExcludedType = excludedTypes.some(type => orderType.includes(type));
      const isExcludedStatus = excludedStatuses.some(status => orderStatus.includes(status));
      
      return !isExcludedType && !isExcludedStatus;
    });
    
    console.log(`✅ ${validOrders.length} valid orders after filtering (excluded quotes/drafts)`);
    
    let syncedCount = 0;
    let errorCount = 0;

    for (const order of validOrders) {
      try {
        // Log full order object to understand FDT's exact field structure
        console.log('📦 Full FDT order object:', JSON.stringify(order, null, 2));
        
        const orderId = order.id || order.orderId || order.orderNumber || 'unknown';
        const orderDate = order.date || order.orderDate || order.createdAt || order.created_at || new Date().toISOString();
        const storeName = order.storeName || order.store || order.location || 'Butik';
        const customerName = order.customerName || order.customer || '';
        const customerNotes = order.notes || order.note || order.customerNotes || order.comment || '';
        
        // Find or create location
        let { data: location } = await supabaseClient
          .from('locations')
          .select('id')
          .eq('name', storeName)
          .maybeSingle();
          
        if (!location) {
          const { data: newLocation, error: locError } = await supabaseClient
            .from('locations')
            .insert({ name: storeName })
            .select()
            .single();
          
          if (locError || !newLocation) {
            console.error('❌ Failed to create location:', locError);
            errorCount++;
            continue;
          }
          location = newLocation;
          console.log(`➕ Created new location: ${storeName}`);
        }

        if (!location) {
          console.error('❌ Location is null after creation attempt');
          errorCount++;
          continue;
        }

        // Create or update order in database
        const { data: existingOrder } = await supabaseClient
          .from('orders')
          .select('id')
          .eq('fdt_order_id', orderId)
          .maybeSingle();
          
        let dbOrder;
        if (existingOrder) {
          const { data } = await supabaseClient
            .from('orders')
            .update({
              customer_notes: customerNotes,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingOrder.id)
            .select()
            .single();
          dbOrder = data;
        } else {
          const { data } = await supabaseClient
            .from('orders')
            .insert({
              fdt_order_id: orderId,
              order_number: orderId,
              customer_name: customerName,
              customer_notes: customerNotes,
              status: 'pending',
              order_date: orderDate,
              location_id: location.id
            })
            .select()
            .single();
          dbOrder = data;
        }

        if (!dbOrder) {
          console.error('❌ Failed to create/update order');
          errorCount++;
          continue;
        }
        
        // Handle orders with multiple line items
        let orderLines = order.lines || order.items || order.details || order.orderLines;
        
        // If no lines found in list response, fetch order details
        if (!orderLines || !Array.isArray(orderLines) || orderLines.length === 0) {
          console.log(`🔄 No lines in order ${orderId}, fetching details...`);
          const detailsResult = await callFDTApi({
            endpoint: `/orders/${orderId}`,
            method: 'GET',
          });
          
          if (detailsResult.success && detailsResult.data) {
            const details = detailsResult.data || {};
            orderLines = details.lines || details.items || details.orderLines || details.details || [];
            console.log(`✅ Fetched ${Array.isArray(orderLines) ? orderLines.length : 0} lines from order details`);
          }
        }
        
        if (orderLines && Array.isArray(orderLines) && orderLines.length > 0) {
          console.log(`📋 Order ${orderId} has ${orderLines.length} line items`);
          
          for (const line of orderLines) {
            // Log full order line object to understand FDT's exact field structure
            console.log('📋 Full FDT order line object:', JSON.stringify(line, null, 2));
            
            // Prioritize itemNumber from nested item object (e.g. line.item.itemNumber = "1201")
            const articleNumber = line.item?.itemNumber || line.itemNumber || line.articleNumber || line.sku || null;
            const internalId = line.itemId || line.item_id || line.productId || null;
            const quantity = line.quantity || line.qty || line.amount || 1;
            
            // Prefer article number over internal ID
            const fdtArticleId = articleNumber || String(internalId);
            
            if (!fdtArticleId) {
              console.warn(`⚠️ Skipping order line without article info in order ${orderId}`);
              console.warn(`📋 Line object keys: ${Object.keys(line).join(', ')}`);
              continue;
            }

            // Try to find product by article number or FDT article ID
            const { data: product } = await supabaseClient
              .from('products')
              .select('id, name')
              .or(`fdt_sellus_article_id.eq.${fdtArticleId},barcode.eq.${fdtArticleId}`)
              .maybeSingle();

            const productId = product?.id || null;

            if (!productId) {
              console.log(`ℹ️ Product not found for article: ${fdtArticleId} - creating order line anyway`);
            } else {
              console.log(`✅ Matched product: ${product?.name} for article: ${fdtArticleId}`);
            }

            // Check if order line already exists with correct article ID
            const { data: existingLine } = await supabaseClient
              .from('order_lines')
              .select('id, fdt_article_id, product_id')
              .eq('order_id', dbOrder.id)
              .eq('fdt_article_id', fdtArticleId)
              .maybeSingle();

            // Check if there's an old line with wrong article ID that needs healing
            const { data: oldLine } = await supabaseClient
              .from('order_lines')
              .select('id, fdt_article_id, product_id')
              .eq('order_id', dbOrder.id)
              .is('product_id', null) // Old lines with failed product matching
              .neq('fdt_article_id', fdtArticleId) // Different article ID
              .maybeSingle();

            if (existingLine) {
              console.log(`✅ Order line already exists for ${fdtArticleId}`);
            } else if (oldLine && productId) {
              // "Heal" the old line by updating it with correct data
              await supabaseClient
                .from('order_lines')
                .update({
                  fdt_article_id: fdtArticleId,
                  product_id: productId,
                  quantity_ordered: quantity,
                })
                .eq('id', oldLine.id);
              console.log(`🩹 Healed order line: ${oldLine.fdt_article_id} → ${fdtArticleId} (product_id: ${productId})`);
            } else {
              // Create new order line
              await supabaseClient
                .from('order_lines')
                .insert({
                  order_id: dbOrder.id,
                  product_id: productId,
                  fdt_article_id: fdtArticleId,
                  quantity_ordered: quantity,
                  quantity_picked: 0,
                  is_picked: false
                });
              console.log(`➕ Created order line for article ${fdtArticleId} (product_id: ${productId || 'pending'})`);
            }

            // Only create transaction if product exists (can't update inventory without product)
            if (productId) {
              await supabaseClient.from('transactions').insert({
                product_id: productId,
                location_id: location.id,
                quantity: quantity,
                type: 'out',
                notes: `Försäljning från FDT (Retail + E-handel) - Order ${orderId}`,
                created_at: orderDate,
              });
            }

            await logSync(supabaseClient, {
              sync_type: 'sale',
              direction: 'sellus_to_wms',
              fdt_article_id: fdtArticleId,
              wms_product_id: productId,
              status: 'success',
              response_payload: line,
              duration_ms: result.duration,
            });

            syncedCount++;
          }
        } else {
          // Handle single-item order (legacy format)
          const articleId = order.articleId || order.itemId || order.item_id;
          const quantity = order.quantity || order.qty || 1;

          if (!articleId) {
            console.warn(`⚠️ Skipping order ${orderId} without article ID`);
            errorCount++;
            continue;
          }

          // Try to find product by fdt_sellus_article_id OR barcode
          const { data: product } = await supabaseClient
            .from('products')
            .select('id')
            .or(`fdt_sellus_article_id.eq.${articleId},barcode.eq.${articleId}`)
            .maybeSingle();

          const productId = product?.id || null;

          if (!productId) {
            console.log(`ℹ️ Product not yet synced for article ID: ${articleId} - creating order line anyway`);
          }

          // Check if order line already exists
          const { data: existingLine } = await supabaseClient
            .from('order_lines')
            .select('id')
            .eq('order_id', dbOrder.id)
            .eq('fdt_article_id', articleId)
            .maybeSingle();
            
          if (!existingLine) {
            await supabaseClient
              .from('order_lines')
              .insert({
                order_id: dbOrder.id,
                product_id: productId,
                fdt_article_id: articleId,
                quantity_ordered: quantity,
                quantity_picked: 0,
                is_picked: false
              });
            console.log(`➕ Created order line for article ${articleId} (product_id: ${productId || 'pending'})`);
          }

          // Only create transaction if product exists
          if (productId) {
            await supabaseClient.from('transactions').insert({
              product_id: productId,
              location_id: location.id,
              quantity: quantity,
              type: 'out',
              notes: `Försäljning från FDT (Retail + E-handel) - Order ${orderId}`,
              created_at: orderDate,
            });
          }

          await logSync(supabaseClient, {
            sync_type: 'sale',
            direction: 'sellus_to_wms',
            fdt_article_id: articleId,
            wms_product_id: productId,
            status: 'success',
            response_payload: order,
            duration_ms: result.duration,
          });

          syncedCount++;
        }
      } catch (error) {
        console.error(`❌ Error syncing order:`, error);
        console.error('📦 Order data:', order);
        
        await logSync(supabaseClient, {
          sync_type: 'sale',
          direction: 'sellus_to_wms',
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          request_payload: order,
          duration_ms: 0,
        });
        
        errorCount++;
      }
    }

    // Zombie order cleanup - remove orders that no longer exist in FDT
    const fdtOrderIds = validOrders.map((o: any) => String(o.id || o.orderId || o.orderNumber));
    console.log(`📋 FDT has ${fdtOrderIds.length} active orders`);

    // Safety check: only proceed with cleanup if we got a reasonable number of orders
    if (fdtOrderIds.length >= 5) {
      // Find orders in database that are NOT in FDT response
      const { data: dbOrders } = await supabaseClient
        .from('orders')
        .select('id, fdt_order_id, order_date, status')
        .not('fdt_order_id', 'in', `(${fdtOrderIds.join(',')})`);

      if (dbOrders && dbOrders.length > 0) {
        console.log(`🔍 Found ${dbOrders.length} orders not in FDT response`);
        
        let deletedOrders = 0;
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - 24); // 24 hours ago
        
        for (const dbOrder of dbOrders) {
          const orderDate = new Date(dbOrder.order_date);
          
          // Safety: only delete orders older than 24h
          if (orderDate < cutoffDate) {
            // Delete order lines first (foreign key)
            await supabaseClient
              .from('order_lines')
              .delete()
              .eq('order_id', dbOrder.id);
            
            // Delete the order
            await supabaseClient
              .from('orders')
              .delete()
              .eq('id', dbOrder.id);
            
            deletedOrders++;
            console.log(`🗑️ Deleted zombie order: ${dbOrder.fdt_order_id} (${dbOrder.order_date})`);
          } else {
            console.log(`⏳ Keeping recent order ${dbOrder.fdt_order_id} (might reappear in FDT)`);
          }
        }
        
        console.log(`✅ Deleted ${deletedOrders} zombie orders`);
      }
    } else {
      console.warn(`⚠️ FDT returned only ${fdtOrderIds.length} orders - skipping zombie cleanup to prevent data loss`);
    }

    // Get total orders in WMS for metadata tracking
    const { count: totalWmsOrders } = await supabaseClient
      .from('orders')
      .select('*', { count: 'exact', head: true });

    // Save sync metadata snapshot
    await supabaseClient
      .from('fdt_sync_metadata')
      .insert({
        sync_type: 'sales',
        last_sync_at: new Date().toISOString(),
        total_items_in_fdt: fdtOrderIds.length,
        total_items_in_wms: totalWmsOrders || 0,
        metadata: {
          synced_count: syncedCount,
          error_count: errorCount,
          valid_orders: validOrders.length,
          total_orders: orders.length
        }
      });

    // Update sync status
    await supabaseClient
      .from('fdt_sync_status')
      .update({
        last_successful_sync: new Date().toISOString(),
        total_synced: syncedCount,
        total_errors: errorCount,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('sync_type', 'sale_import');

    console.log(`✅ Sales sync completed: ${syncedCount} synced, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Sales sync error:', error);
    
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const isAuthError = errorMsg.includes('401') || errorMsg.toLowerCase().includes('auth');
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg,
      }),
      { 
        status: isAuthError ? 502 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
