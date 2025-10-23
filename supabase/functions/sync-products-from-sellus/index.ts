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
      endpoint: '/items/full',
      method: 'GET',
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    const articles = Array.isArray(result.data) ? result.data : (result.data.items || []);
    console.log(`📦 Found ${articles.length} products to sync`);
    
    let syncedCount = 0;
    let errorCount = 0;

    for (const article of articles) {
      try {
        // Handle multiple possible field name variations from FDT API
        const articleId = article.id || article.articleId || article.itemId;
        const name = article.name || article.description || article.itemName || article.title;
        const barcode = article.barcode || article.ean || article.gtin || article.articleNumber;
        const category = article.category || article.categoryName || article.itemGroup || article.group;
        const description = article.description || article.longDescription || article.details;
        const minStock = article.minStock || article.minimumStock || article.min_stock || 0;
        const unit = article.unit || article.unitOfMeasure || article.measure || 'st';

        if (!articleId) {
          console.warn('⚠️ Skipping product without ID:', article);
          errorCount++;
          continue;
        }

        if (!name) {
          console.warn(`⚠️ Skipping product ${articleId} without name`);
          errorCount++;
          continue;
        }

        const { data: existingProduct } = await supabaseClient
          .from('products')
          .select('id')
          .eq('fdt_sellus_article_id', articleId)
          .maybeSingle();

        const productData = {
          name,
          barcode,
          category,
          description,
          min_stock: minStock,
          unit,
          fdt_sellus_article_id: articleId,
        };

        if (existingProduct) {
          await supabaseClient
            .from('products')
            .update(productData)
            .eq('id', existingProduct.id);
          console.log(`✏️ Updated product: ${name} (${articleId})`);
        } else {
          await supabaseClient
            .from('products')
            .insert(productData);
          console.log(`➕ Created product: ${name} (${articleId})`);
        }

        await logSync(supabaseClient, {
          sync_type: 'product',
          direction: 'sellus_to_wms',
          fdt_article_id: articleId,
          status: 'success',
          response_payload: article,
          duration_ms: result.duration,
        });

        syncedCount++;
      } catch (error) {
        console.error(`❌ Error syncing product:`, error);
        console.error('📦 Product data:', article);
        
        await logSync(supabaseClient, {
          sync_type: 'product',
          direction: 'sellus_to_wms',
          fdt_article_id: article.id || 'unknown',
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          request_payload: article,
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
