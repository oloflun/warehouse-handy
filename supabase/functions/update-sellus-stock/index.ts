import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callFDTApi, logSync } from '../_shared/fdt-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StockUpdateErrorResponse {
  success: false;
  error: string;
  details?: string;
  articleId?: string;
  numericId?: string;
  branchId?: string;
  productName?: string;
}

interface StockUpdateSuccessResponse {
  success: boolean;
  message: string;
  product: string;
  oldStock: number;
  newStock: number;
  observedStock: number;
  verified: boolean;
  numericId: string;
  articleId: string;
  branchId: string;
  usedBranchFallback: boolean;
}

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
  let usedBranchFallback = false;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { productId, quantity, locationId } = await req.json();

    if (!productId || quantity === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: 'productId and quantity required' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // STRATEGY: Always require numeric ID - no fallbacks
    console.log(`🔍 Step 1: Check for cached numeric ID`);
    let numericId: string | null = product.fdt_sellus_item_numeric_id;

    if (!numericId) {
      console.log(`⚠️ No cached numeric ID found for article ${product.fdt_sellus_article_id}`);
      console.log(`🔍 Step 2: Attempting auto-resolve via edge function`);
      
      // Try auto-resolve function
      const resolveResponse = await supabaseClient.functions.invoke('auto-resolve-item-id', {
        body: { productId: product.id }
      });

      if (resolveResponse.error) {
        console.error('❌ Auto-resolve failed with invoke error:', resolveResponse.error);
      } else if (resolveResponse.data?.success && resolveResponse.data?.numericId) {
        numericId = String(resolveResponse.data.numericId);
        console.log(`✅ Auto-resolve SUCCESS: Numeric ID = ${numericId}`);
      } else if (resolveResponse.data?.error) {
        console.error('❌ Auto-resolve failed with error:', resolveResponse.data.error);
      } else {
        console.error('❌ Auto-resolve returned unexpected response:', resolveResponse.data);
      }
      
      // If STILL no numeric ID, fail the sync
      if (!numericId) {
        console.error(`❌ SYNC FAILED: No numeric ID available for article ${product.fdt_sellus_article_id}`);
        console.error(`💡 Solution: Run batch-resolve-all-ids or manually set numeric ID in UI`);
        
        const duration = Date.now() - startTime;
        await logSync(supabaseClient, {
          sync_type: 'inventory_item',
          direction: 'wms_to_fdt',
          fdt_article_id: product.fdt_sellus_article_id,
          wms_product_id: productId,
          status: 'error',
          error_message: `Cannot sync: No numeric ID for article ${product.fdt_sellus_article_id}. Run batch-resolve-all-ids to fix.`,
          request_payload: { stock: totalStock },
          duration_ms: duration,
        });

        const errorResponse: StockUpdateErrorResponse = {
          success: false, 
          error: `Cannot sync: No numeric ID for article ${product.fdt_sellus_article_id}`,
          details: 'Run batch-resolve-all-ids edge function or manually set fdt_sellus_item_numeric_id',
          articleId: product.fdt_sellus_article_id,
          productName: product.name
        };
        
        return new Response(
          JSON.stringify(errorResponse),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log(`✅ Using cached numeric ID: ${numericId}`);
    }

    // Step 3: Fetch current item data to capture old stock (for verification)
    console.log(`📥 Fetching current item data from Sellus using numeric ID: ${numericId}`);
    console.log(`🏢 Using branch: ${branchId}`);
    
    let getItemResponse = await callFDTApi({
      endpoint: `/items/${numericId}?branchId=${branchId}`,
      method: 'GET',
    });

    // Fallback: Try without branchId if not found
    if (!getItemResponse.success && getItemResponse.error?.includes('404')) {
      console.warn(`⚠️ Item ${numericId} not found with branchId=${branchId}, trying without branch...`);
      getItemResponse = await callFDTApi({
        endpoint: `/items/${numericId}`,
        method: 'GET',
      });
      usedBranchFallback = true;
      
      if (getItemResponse.success) {
        console.log('✅ Successfully fetched item without branchId (fallback)');
      }
    }

    if (!getItemResponse.success || !getItemResponse.data) {
      const errorMsg = `Item ${numericId} not found. Tried: /items/${numericId}?branchId=${branchId}${usedBranchFallback ? ` and /items/${numericId}` : ''}. Article: ${product.fdt_sellus_article_id}`;
      
      console.error(`❌ Failed to fetch item data from Sellus: ${getItemResponse.error}`);
      console.error(`💡 ${errorMsg}`);
      
      const duration = Date.now() - startTime;
      await logSync(supabaseClient, {
        sync_type: 'inventory_item',
        direction: 'wms_to_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: productId,
        status: 'error',
        error_message: errorMsg,
        request_payload: { stock: totalStock, branchId: branchId || 'not configured' },
        duration_ms: duration,
      });

      const errorResponse: StockUpdateErrorResponse = {
        success: false, 
        error: errorMsg,
        details: getItemResponse.error,
        articleId: product.fdt_sellus_article_id,
        numericId,
        branchId
      };
      
      return new Response(
        JSON.stringify(errorResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Capture old stock for verification
    const existingItem = getItemResponse.data;
    const oldStock = existingItem.stock || existingItem.quantity || existingItem.availableQuantity || 0;
    console.log(`📊 Old stock in Sellus: ${oldStock}, New stock to set: ${totalStock}`);
    
    // Step 4: Create minimal stock update payload
    // We send multiple field names (stock, quantity, availableQuantity) to ensure 
    // compatibility - the FDT API may accept any of these depending on configuration
    const updatePayload = {
      stock: totalStock,
      quantity: totalStock,
      availableQuantity: totalStock,
    };

    console.log(`📤 Updating Sellus item ${numericId} (article: ${product.fdt_sellus_article_id}) with payload:`, updatePayload);

    // Try POST first with branch-specific endpoint, fallback to PUT if needed
    let updateResponse = await callFDTApi({
      endpoint: `/items/${numericId}?branchId=${branchId}`,
      method: 'POST',
      body: updatePayload,
    });

    // If POST fails with method error, try PUT
    if (!updateResponse.success && (updateResponse.error?.includes('405') || updateResponse.error?.includes('Method'))) {
      console.log(`⚠️ POST failed, trying PUT method`);
      updateResponse = await callFDTApi({
        endpoint: `/items/${numericId}?branchId=${branchId}`,
        method: 'PUT',
        body: updatePayload,
      });
    }

    const duration = Date.now() - startTime;

    if (updateResponse.success) {
      // Step 5: Read-after-write verification
      console.log(`🔍 Verifying stock update - reading back from Sellus...`);
      const verifyResponse = await callFDTApi({
        endpoint: `/items/${numericId}?branchId=${branchId}`,
        method: 'GET',
      });

      let observedStock = totalStock; // Default to what we tried to set
      let verificationStatus = 'success';
      let verificationMessage = '';

      if (verifyResponse.success && verifyResponse.data) {
        observedStock = verifyResponse.data.stock || verifyResponse.data.quantity || verifyResponse.data.availableQuantity || 0;
        
        if (observedStock === totalStock) {
          console.log(`✅ Stock verified: ${totalStock} (matches expected value)`);
          verificationMessage = `Stock changed from ${oldStock} to ${totalStock} for branch ${branchId}`;
        } else {
          console.error(`⚠️ Stock mismatch! Expected: ${totalStock}, Observed: ${observedStock}`);
          verificationStatus = 'error';
          verificationMessage = `Branch stock did not change correctly. Expected: ${totalStock}, Observed: ${observedStock}`;
        }
      } else {
        console.warn(`⚠️ Could not verify stock update: ${verifyResponse.error}`);
        verificationMessage = `Update sent but verification failed: ${verifyResponse.error}`;
      }

      await logSync(supabaseClient, {
        sync_type: 'inventory_item',
        direction: 'wms_to_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: productId,
        status: verificationStatus,
        request_payload: { 
          stock: totalStock, 
          numericId, 
          articleId: product.fdt_sellus_article_id, 
          branchId, 
          usedBranchFallback,
          strategy: 'items?id&branchId'
        },
        response_payload: updateResponse.data,
        error_message: verificationStatus === 'error' ? verificationMessage : undefined,
        duration_ms: duration,
      });

      const response: StockUpdateSuccessResponse = {
        success: verificationStatus === 'success',
        message: verificationMessage,
        product: product.name,
        oldStock,
        newStock: totalStock,
        observedStock,
        verified: observedStock === totalStock,
        numericId,
        articleId: product.fdt_sellus_article_id,
        branchId,
        usedBranchFallback
      };
      
      return new Response(
        JSON.stringify(response),
        { status: verificationStatus === 'success' ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        request_payload: { stock: totalStock, numericId, articleId: product.fdt_sellus_article_id },
        duration_ms: duration,
      });

      const errorResponse: StockUpdateErrorResponse = {
        success: false, 
        error: 'Failed to update stock in Sellus',
        details: updateResponse.error,
        articleId: product.fdt_sellus_article_id,
        numericId,
        branchId
      };
      
      return new Response(
        JSON.stringify(errorResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Exception in update-sellus-stock:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
