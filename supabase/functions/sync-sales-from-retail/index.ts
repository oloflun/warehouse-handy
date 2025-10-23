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

    const { data: syncStatus } = await supabaseClient
      .from('fdt_sync_status')
      .select('last_successful_sync')
      .eq('sync_type', 'sale_import')
      .maybeSingle();

    const since = syncStatus?.last_successful_sync || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    console.log(`🔄 Fetching orders since ${since}...`);

    const result = await callFDTApi({
      endpoint: `/orders?since=${encodeURIComponent(since)}`,
      method: 'GET',
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    const orders = Array.isArray(result.data) ? result.data : (result.data.orders || []);
    let syncedCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        // Map order details - adjust field names based on actual FDT API response
        const articleId = order.articleId || order.itemId || order.item_id;
        const quantity = order.quantity || order.qty || 1;
        const storeName = order.storeName || order.store || 'Butik';
        const orderId = order.id || order.orderId || 'unknown';
        const orderDate = order.date || order.orderDate || new Date().toISOString();

        const { data: product } = await supabaseClient
          .from('products')
          .select('id')
          .eq('fdt_sellus_article_id', articleId)
          .maybeSingle();

        if (!product) {
          console.warn(`Product not found for article ID: ${articleId}`);
          continue;
        }

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
            console.error('Failed to create location:', locError);
            continue;
          }
          location = newLocation;
        }

        if (!location) {
          console.error('Location is null after creation attempt');
          continue;
        }

        await supabaseClient.from('transactions').insert({
          product_id: product.id,
          location_id: location.id,
          quantity: quantity,
          type: 'out',
          notes: `Försäljning från FDT - Order ${orderId}`,
          created_at: orderDate,
        });

        await logSync(supabaseClient, {
          sync_type: 'sale',
          direction: 'sellus_to_wms',
          fdt_article_id: articleId,
          wms_product_id: product.id,
          status: 'success',
          response_payload: order,
          duration_ms: result.duration,
        });

        syncedCount++;
      } catch (error) {
        console.error(`Error syncing sale:`, error);
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
