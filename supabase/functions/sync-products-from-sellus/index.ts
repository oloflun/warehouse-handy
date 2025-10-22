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

    console.log('🔄 Starting product sync from FDT Sellus...');

    const result = await callFDTApi({
      endpoint: '/articles',
      method: 'GET',
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    const articles = Array.isArray(result.data) ? result.data : (result.data.articles || []);
    let syncedCount = 0;
    let errorCount = 0;

    for (const article of articles) {
      try {
        const { data: existingProduct } = await supabaseClient
          .from('products')
          .select('id')
          .eq('fdt_sellus_article_id', article.id || article.articleNumber)
          .maybeSingle();

        const productData = {
          name: article.name || article.description,
          barcode: article.barcode || article.ean || article.articleNumber || `FDT-${article.id}`,
          category: article.category || article.categoryName,
          description: article.description || article.longDescription,
          min_stock: article.minStock || 0,
          unit: article.unit || 'st',
          fdt_sellus_article_id: article.id || article.articleNumber,
          fdt_last_synced: new Date().toISOString(),
          fdt_sync_status: 'synced',
        };

        let productId;

        if (existingProduct) {
          const { data, error } = await supabaseClient
            .from('products')
            .update(productData)
            .eq('id', existingProduct.id)
            .select()
            .single();

          if (error) throw error;
          productId = existingProduct.id;
        } else {
          const { data, error } = await supabaseClient
            .from('products')
            .insert(productData)
            .select()
            .single();

          if (error) throw error;
          productId = data.id;
        }

        await logSync(supabaseClient, {
          sync_type: 'product',
          direction: 'sellus_to_wms',
          fdt_article_id: article.id || article.articleNumber,
          wms_product_id: productId,
          status: 'success',
          request_payload: null,
          response_payload: article,
          duration_ms: result.duration,
        });

        syncedCount++;
      } catch (error) {
        console.error(`Error syncing product ${article.id}:`, error);
        
        await logSync(supabaseClient, {
          sync_type: 'product',
          direction: 'sellus_to_wms',
          fdt_article_id: article.id || article.articleNumber,
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          response_payload: article,
          duration_ms: result.duration,
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
      .eq('sync_type', 'product_import');

    console.log(`✅ Product sync completed: ${syncedCount} synced, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        errors: errorCount,
        message: `Synced ${syncedCount} products from FDT Sellus`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Product sync error:', error);
    
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
