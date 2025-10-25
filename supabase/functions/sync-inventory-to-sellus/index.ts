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

  // Verify JWT token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized - missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔄 Starting inventory sync to FDT Sellus...');

    const { data: inventory, error } = await supabaseClient
      .from('inventory')
      .select(`
        quantity,
        product_id,
        location_id
      `);

    if (error) throw error;

    let syncedCount = 0;
    let errorCount = 0;

    console.log(`📦 Found ${inventory.length} inventory items to sync`);

    for (const item of inventory) {
      try {
        // Get product details
        const { data: product } = await supabaseClient
          .from('products')
          .select('id, fdt_sellus_article_id, name')
          .eq('id', item.product_id)
          .maybeSingle();
        
        if (!product?.fdt_sellus_article_id) {
          console.warn(`⚠️ Skipping product ${item.product_id} - no FDT article ID`);
          continue;
        }
        
        // Get location details
        const { data: location } = await supabaseClient
          .from('locations')
          .select('name')
          .eq('id', item.location_id)
          .maybeSingle();

        console.log(`🔄 Syncing ${product.name} (${product.fdt_sellus_article_id}) - Quantity: ${item.quantity}`);

        // Try to resolve numeric id and fetch existing item data
        let targetId: string | number = product.fdt_sellus_article_id;
        let existing: any = null;

        let getResult = await callFDTApi({
          endpoint: `/items/${product.fdt_sellus_article_id}`,
          method: 'GET',
        });

        if (getResult.success && getResult.data) {
          existing = getResult.data;
          targetId = existing?.id ?? targetId;
          console.log(`✅ Found existing item by id: ${targetId}`);
        } else {
          console.warn(`⚠️ GET /items/${product.fdt_sellus_article_id} failed, listing to resolve numeric id`);
          let list = await callFDTApi({ endpoint: `/items?branchId=5`, method: 'GET' });
          if (!list.success || !list.data) {
            console.warn('⚠️ /items?branchId=5 returned no data, trying /items/full');
            list = await callFDTApi({ endpoint: `/items/full?branchId=5`, method: 'GET' });
          }
          const payload = list.data || {};
          const items = Array.isArray(payload) ? payload : payload.results || payload.items || payload.data || [];
          const found = items.find((it: any) => String(it.itemNumber) === String(product.fdt_sellus_article_id));
          if (found) {
            existing = found;
            targetId = found.id ?? targetId;
            console.log(`✅ Resolved numeric item id ${targetId} for itemNumber ${product.fdt_sellus_article_id}`);
          }
        }

        // Prepare safe update body (ensure accounting fields and stock flags)
        const updateBody: any = {
          ...(existing || {}),
          branchId: 5,
          vatId: existing?.vatId ?? 1,
          salesAccount: existing?.salesAccount ?? 3001,
          stockStatus: existing?.stockStatus ?? 'stockItem',
          inventoryStatus: existing?.inventoryStatus ?? 'normal',
          quantity: item.quantity,
          stock: item.quantity,
          availableQuantity: item.quantity,
        };

        // Update item using POST /items/{id} endpoint
        const result = await callFDTApi({
          endpoint: `/items/${targetId}`,
          method: 'POST',
          body: updateBody,
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        console.log(`✅ Successfully synced ${product.name}`);

        await logSync(supabaseClient, {
          sync_type: 'inventory',
          direction: 'wms_to_sellus',
          fdt_article_id: product.fdt_sellus_article_id,
          wms_product_id: product.id,
          status: 'success',
          request_payload: { quantity: item.quantity },
          response_payload: result.data,
          duration_ms: result.duration,
        });

        syncedCount++;
      } catch (error) {
        console.error(`❌ Error syncing inventory:`, error);
        
        await logSync(supabaseClient, {
          sync_type: 'inventory',
          direction: 'wms_to_sellus',
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: 0,
        });

        errorCount++;
      }
    }

    await supabaseClient
      .from('fdt_sync_status')
      .update({
        last_successful_sync: new Date().toISOString(),
        total_synced: syncedCount,
        total_errors: errorCount,
        updated_at: new Date().toISOString(),
      })
      .eq('sync_type', 'inventory_export');

    console.log(`✅ Inventory sync completed: ${syncedCount} synced, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Inventory sync error:', error);
    
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
