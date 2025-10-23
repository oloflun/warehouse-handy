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

    console.log('🔄 Starting product sync from FDT Sellus...');

    // Try /items first, fallback to /items/full if needed
    // Filter for Elon branch only (branchId=5)
    let result = await callFDTApi({
      endpoint: '/items?branchId=5',
      method: 'GET',
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Robust parsing of articles array
    const payload = result.data || {};
    let articles = Array.isArray(payload)
      ? payload
      : payload.results || payload.items || payload.data || [];
    
    console.log('🔍 FDT payload keys:', Object.keys(payload));
    console.log(`📦 Found ${articles.length} products from /items`);
    
    // If /items didn't return data, try /items/full
    if (!articles || articles.length === 0) {
      console.log('⚠️ /items returned no data, trying /items/full...');
      result = await callFDTApi({
        endpoint: '/items/full?branchId=5',
        method: 'GET',
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const fullPayload = result.data || {};
      articles = Array.isArray(fullPayload)
        ? fullPayload
        : fullPayload.results || fullPayload.items || fullPayload.data || [];
      
      console.log('🔍 FDT /items/full payload keys:', Object.keys(fullPayload));
      console.log(`📦 Found ${articles.length} products from /items/full`);
    }

    if (!articles || articles.length === 0) {
      console.log('⚠️ No products found from FDT API - check API endpoint or branchId');
    }
    
    console.log(`📦 Total ${articles.length} products to sync`);
    
    let syncedCount = 0;
    let errorCount = 0;

    for (const article of articles) {
      try {
        // Handle multiple possible field name variations from FDT API
        const articleIdRaw = article.id || article.articleId || article.itemId;
        const articleId = articleIdRaw != null ? String(articleIdRaw) : null;
        const name = article.name || article.description || article.itemName || article.title;
        const barcode = article.barcode || article.ean || article.gtin || null;
        const articleNumber = article.articleNumber || article.itemNumber || article.sku || null;
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
          await logSync(supabaseClient, {
            sync_type: 'product',
            direction: 'sellus_to_wms',
            fdt_article_id: articleId,
            status: 'error',
            error_message: 'Missing name',
            request_payload: article,
            duration_ms: 0,
          });
          errorCount++;
          continue;
        }

        // Skip products without BOTH barcode AND article number
        if (!barcode && !articleNumber) {
          console.warn(`⚠️ Skipping product ${articleId} (${name}) - missing both barcode AND article number`);
          await logSync(supabaseClient, {
            sync_type: 'product',
            direction: 'sellus_to_wms',
            fdt_article_id: articleId,
            status: 'error',
            error_message: 'Missing both barcode and article number',
            request_payload: article,
            duration_ms: 0,
          });
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
          barcode: barcode || articleNumber,
          category,
          description,
          min_stock: minStock,
          unit,
          fdt_sellus_article_id: articleId,
        };

        if (existingProduct) {
          const { error: updateError } = await supabaseClient
            .from('products')
            .update(productData)
            .eq('id', existingProduct.id);
          
          if (updateError) {
            throw updateError;
          }
          console.log(`✏️ Updated product: ${name} (${articleId})`);
        } else {
          const { error: insertError } = await supabaseClient
            .from('products')
            .insert(productData);
          
          if (insertError) {
            throw insertError;
          }
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
        
        const articleIdForLog = article.id || article.articleId || article.itemId || 'unknown';
        await logSync(supabaseClient, {
          sync_type: 'product',
          direction: 'sellus_to_wms',
          fdt_article_id: String(articleIdForLog),
          status: 'error',
          error_message: error instanceof Error ? error.message : String(error),
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
