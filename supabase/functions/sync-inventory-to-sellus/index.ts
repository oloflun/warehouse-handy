import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

        // First, try to get the existing item data from FDT
        const getResult = await callFDTApi({
          endpoint: `/items/${product.fdt_sellus_article_id}`,
          method: 'GET',
        });

        let updateBody: any;

        if (getResult.success && getResult.data) {
          // Update existing item with all fields preserved
          console.log(`✅ Found existing item in FDT, updating quantity`);
          updateBody = {
            ...getResult.data,
            quantity: item.quantity,
            stock: item.quantity,
            availableQuantity: item.quantity,
          };
        } else {
          // If GET fails, try POST with minimal data
          console.log(`⚠️ Could not fetch existing item, attempting update with minimal data`);
          updateBody = {
            quantity: item.quantity,
            stock: item.quantity,
            availableQuantity: item.quantity,
          };
        }

        // Update item using POST /items/{id} endpoint
        const result = await callFDTApi({
          endpoint: `/items/${product.fdt_sellus_article_id}`,
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
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
