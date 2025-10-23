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

    // Step 1: Fetch product groups and find "1200- Elon"
    console.log('📋 Fetching product groups...');
    const groupsResult = await callFDTApi({
      endpoint: '/productgroups',
      method: 'GET',
    });

    if (!groupsResult.success) {
      throw new Error('Failed to fetch product groups: ' + groupsResult.error);
    }

    const productGroups = groupsResult.data?.results || groupsResult.data || [];
    console.log(`📋 Found ${productGroups.length} product groups`);
    
    const elonGroup = productGroups.find(
      (g: any) => g.name?.includes('1200') || g.name?.includes('Elon') || g.code === '1200'
    );

    if (!elonGroup) {
      throw new Error('❌ Varugrupp "1200- Elon" hittades inte i FDT API');
    }

    console.log(`✅ Found Elon product group: ${JSON.stringify(elonGroup)}`);
    const elonGroupId = elonGroup.id || elonGroup.productGroupId;

    // Step 2: Fetch products filtered by product group
    console.log(`🌐 Fetching items from productGroupId=${elonGroupId}`);
    let result = await callFDTApi({
      endpoint: `/items?branchId=5&productGroupId=${elonGroupId}`,
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
    
    console.log(`📦 Total ${articles.length} products to sync from varugrupp 1200- Elon`);

    let syncedCount = 0;
    let errorCount = 0;
    const syncedArticleIds: string[] = [];

    for (const article of articles) {
      try {
        // Log full article object to understand FDT's exact field structure
        console.log('📦 Full FDT article object:', JSON.stringify(article, null, 2));
        
        // Use exact field names from FDT - don't guess or fallback
        const articleId = article.id != null ? String(article.id) : null;
        const name = article.name || null;
        const barcode = article.barcode || null;
        const articleNumber = article.itemNumber || null;
        const category = article.category || null;
        const description = article.description || null;
        const minStock = article.minStock || 0;
        const unit = article.unit || 'st';
        const purchasePrice = article.purchasePrice || null;
        const salesPrice = article.unitPrice || null;

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
          fdt_sellus_article_id: articleNumber || articleId, // Prefer itemNumber (e.g. "1201") over internal ID
          purchase_price: purchasePrice,
          sales_price: salesPrice,
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
        syncedArticleIds.push(articleId);
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

    // Step 3: Clean up products not in "1200- Elon" group
    console.log('🧹 Cleaning up products outside varugrupp 1200...');
    let deletedCount = 0;
    let inactivatedCount = 0;

    if (syncedArticleIds.length > 0) {
      const { data: productsToRemove } = await supabaseClient
        .from('products')
        .select('id, name, fdt_sellus_article_id, barcode')
        .not('fdt_sellus_article_id', 'in', `(${syncedArticleIds.join(',')})`);

      if (productsToRemove && productsToRemove.length > 0) {
        console.log(`🧹 Found ${productsToRemove.length} products outside varugrupp 1200`);

        for (const product of productsToRemove) {
          // Check if product has inventory or order lines
          const [invCheck, orderCheck] = await Promise.all([
            supabaseClient.from('inventory').select('id').eq('product_id', product.id).maybeSingle(),
            supabaseClient.from('order_lines').select('id').eq('product_id', product.id).maybeSingle(),
          ]);

          if (invCheck.data || orderCheck.data) {
            // Product is in use - mark as inactive
            await supabaseClient
              .from('products')
              .update({ fdt_sync_status: 'inactive' })
              .eq('id', product.id);

            inactivatedCount++;
            console.log(`⚠️ Inactivated: ${product.barcode || product.name} (in use)`);
          } else {
            // Product not in use - delete
            await supabaseClient
              .from('products')
              .delete()
              .eq('id', product.id);

            deletedCount++;
            console.log(`🗑️ Deleted: ${product.barcode || product.name}`);
          }
        }

        console.log(`✅ Cleanup done: ${deletedCount} deleted, ${inactivatedCount} inactivated`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        errors: errorCount,
        deleted: deletedCount,
        inactivated: inactivatedCount,
        message: `Synced ${syncedCount} products from varugrupp 1200- Elon`,
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
