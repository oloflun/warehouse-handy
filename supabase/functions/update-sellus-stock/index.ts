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
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { productId, quantity, locationId } = await req.json();

    if (!productId || quantity === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: 'productId and quantity required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Updating Sellus stock for product ${productId}, quantity change: ${quantity}`);

    // Fetch product details
    const { data: product, error: productError } = await supabaseClient
      .from('products')
      .select('id, name, barcode, fdt_sellus_article_id, fdt_sellus_item_numeric_id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('Product not found:', productError);
      return new Response(
        JSON.stringify({ success: false, error: 'Product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!product.fdt_sellus_article_id) {
      console.log('⏭️ Product has no FDT article ID, skipping Sellus sync');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Product not synced to Sellus (no fdt_sellus_article_id)',
          skipped: true 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total stock across all locations
    const { data: inventoryItems } = await supabaseClient
      .from('inventory')
      .select('quantity')
      .eq('product_id', productId);

    const totalStock = inventoryItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    console.log(`📊 Total stock for ${product.name}: ${totalStock} (across all locations)`);

    // Step 1: Try to use cached numeric ID if available
    let resolvedNumericId: string | number | null = product.fdt_sellus_item_numeric_id;
    let itemNumber = product.fdt_sellus_article_id;

    if (!resolvedNumericId) {
      console.log(`🔍 No cached numeric ID, resolving for article ${product.fdt_sellus_article_id}`);
      
      // Step 2: Try direct GET if the article_id looks numeric
      const articleIdStr = String(product.fdt_sellus_article_id);
      const isNumeric = /^\d+$/.test(articleIdStr);
      
      if (isNumeric) {
        console.log(`🔢 Trying direct GET /items/${articleIdStr} (numeric ID)`);
        const directResponse = await callFDTApi({
          endpoint: `/items/${articleIdStr}`,
          method: 'GET',
        });
        
        if (directResponse.success && directResponse.data?.id) {
          resolvedNumericId = directResponse.data.id;
          itemNumber = directResponse.data.itemNumber || itemNumber;
          console.log(`✅ Direct GET succeeded: numeric ID = ${resolvedNumericId}, itemNumber = ${itemNumber}`);
        } else {
          console.log(`⚠️ Direct GET failed: ${directResponse.error || 'No data returned'}`);
        }
      }

      // Step 3: If still not resolved, search by itemNumber (branch-independent)
      if (!resolvedNumericId) {
        console.log(`🔍 Searching by itemNumber=${product.fdt_sellus_article_id} (branch-independent)`);
        
        // Try various endpoints to find the item
        const searchEndpoints = [
          `/items?itemNumber=${product.fdt_sellus_article_id}`,
          `/items/full?itemNumber=${product.fdt_sellus_article_id}`,
        ];

        // If FDT_SELLUS_BRANCH_ID is configured, also try with branch filter
        const branchId = Deno.env.get('FDT_SELLUS_BRANCH_ID');
        if (branchId) {
          searchEndpoints.push(`/items?branchId=${branchId}&itemNumber=${product.fdt_sellus_article_id}`);
          searchEndpoints.push(`/items/full?branchId=${branchId}&itemNumber=${product.fdt_sellus_article_id}`);
        }

        for (const endpoint of searchEndpoints) {
          console.log(`🔎 Trying: ${endpoint}`);
          const searchResponse = await callFDTApi({ endpoint, method: 'GET' });
          
          if (searchResponse.success && searchResponse.data) {
            const payload = searchResponse.data;
            const items = Array.isArray(payload) ? payload : 
                         payload.results || payload.items || payload.data || [];
            
            const found = items.find((it: any) => 
              String(it.itemNumber) === String(product.fdt_sellus_article_id)
            );
            
            if (found) {
              resolvedNumericId = found.id;
              itemNumber = found.itemNumber || itemNumber;
              console.log(`✅ Found via ${endpoint}: numeric ID = ${resolvedNumericId}, itemNumber = ${itemNumber}`);
              break;
            }
          }
        }

        // Step 4: Last resort - fetch all items and search in code
        if (!resolvedNumericId) {
          console.log(`🔍 Last resort: fetching all items and searching in code`);
          const endpoints = branchId 
            ? [`/items?branchId=${branchId}`, `/items/full?branchId=${branchId}`]
            : ['/items', '/items/full'];

          for (const endpoint of endpoints) {
            console.log(`📥 Fetching: ${endpoint}`);
            const allItemsResponse = await callFDTApi({ endpoint, method: 'GET' });
            
            if (allItemsResponse.success && allItemsResponse.data) {
              const payload = allItemsResponse.data;
              const items = Array.isArray(payload) ? payload : 
                           payload.results || payload.items || payload.data || [];
              
              const found = items.find((it: any) => 
                String(it.itemNumber) === String(product.fdt_sellus_article_id)
              );
              
              if (found) {
                resolvedNumericId = found.id;
                itemNumber = found.itemNumber || itemNumber;
                console.log(`✅ Found in full list: numeric ID = ${resolvedNumericId}, itemNumber = ${itemNumber}`);
                break;
              }
            }
          }
        }
      }

      // Step 5: Cache the resolved numeric ID for future use
      if (resolvedNumericId) {
        console.log(`💾 Caching numeric ID ${resolvedNumericId} for product ${product.id}`);
        await supabaseClient
          .from('products')
          .update({ fdt_sellus_item_numeric_id: String(resolvedNumericId) })
          .eq('id', product.id);
      } else {
        console.error(`❌ Could not resolve numeric ID for itemNumber=${product.fdt_sellus_article_id}`);
        
        const duration = Date.now() - startTime;
        await logSync(supabaseClient, {
          sync_type: 'inventory_item',
          direction: 'wms_to_fdt',
          fdt_article_id: product.fdt_sellus_article_id,
          wms_product_id: productId,
          status: 'error',
          error_message: `Could not resolve Sellus item ID for itemNumber ${product.fdt_sellus_article_id}`,
          request_payload: { stock: totalStock },
          duration_ms: duration,
        });

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Could not find item in Sellus with itemNumber ${product.fdt_sellus_article_id}`,
            details: 'Item may not exist in Sellus or may be in a different branch'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log(`✨ Using cached numeric ID: ${resolvedNumericId}`);
    }

    // Step 6: Fetch full item data from Sellus to preserve all required fields
    const branchId = Deno.env.get('FDT_SELLUS_BRANCH_ID');
    console.log(`📥 Fetching full item data from Sellus for item ${resolvedNumericId}${branchId ? ` (branch: ${branchId})` : ''}`);
    
    const getEndpoint = branchId 
      ? `/items/${resolvedNumericId}?branchId=${branchId}`
      : `/items/${resolvedNumericId}`;
    
    const getItemResponse = await callFDTApi({
      endpoint: getEndpoint,
      method: 'GET',
    });

    if (!getItemResponse.success || !getItemResponse.data) {
      console.error(`❌ Failed to fetch item data from Sellus: ${getItemResponse.error}`);
      
      const duration = Date.now() - startTime;
      await logSync(supabaseClient, {
        sync_type: 'inventory_item',
        direction: 'wms_to_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: productId,
        status: 'error',
        error_message: `Could not fetch item ${resolvedNumericId} from Sellus: ${getItemResponse.error}`,
        request_payload: { stock: totalStock },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Could not fetch item from Sellus`,
          details: getItemResponse.error
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 7: Merge existing item data with our stock update
    const existingItem = getItemResponse.data;
    console.log(`✅ Fetched item data, merging with stock: ${totalStock}`);
    
    const updatePayload = {
      ...existingItem,
      stock: totalStock,
      quantity: totalStock,
      availableQuantity: totalStock,
    };

    // Ensure branchId is set if configured
    if (branchId) {
      updatePayload.branchId = parseInt(branchId);
    }

    console.log(`📤 Updating Sellus item ${resolvedNumericId} (itemNumber: ${itemNumber}) with complete payload`);

    // Try POST first, fallback to PUT if needed
    let updateResponse = await callFDTApi({
      endpoint: `/items/${resolvedNumericId}`,
      method: 'POST',
      body: updatePayload,
    });

    // If POST fails with method error, try PUT
    if (!updateResponse.success && (updateResponse.error?.includes('405') || updateResponse.error?.includes('Method'))) {
      console.log(`⚠️ POST failed, trying PUT method`);
      updateResponse = await callFDTApi({
        endpoint: `/items/${resolvedNumericId}`,
        method: 'PUT',
        body: updatePayload,
      });
    }

    const duration = Date.now() - startTime;

    if (updateResponse.success) {
      console.log(`✅ Successfully updated stock in Sellus for ${product.name}`);

      await logSync(supabaseClient, {
        sync_type: 'inventory_item',
        direction: 'wms_to_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: productId,
        status: 'success',
        request_payload: { stock: totalStock, resolvedNumericId, itemNumber },
        response_payload: updateResponse.data,
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Stock updated in Sellus',
          product: product.name,
          newStock: totalStock,
          resolvedNumericId,
          itemNumber,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.error('Failed to update stock in Sellus:', updateResponse.error);

      await logSync(supabaseClient, {
        sync_type: 'inventory_item',
        direction: 'wms_to_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: productId,
        status: 'error',
        error_message: updateResponse.error,
        request_payload: { stock: totalStock, resolvedNumericId, itemNumber },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to update stock in Sellus',
          details: updateResponse.error 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Exception in update-sellus-stock:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
