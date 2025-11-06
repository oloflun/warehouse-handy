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
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
      const errorMsg = 'No products found from FDT API. This could mean: 1) API credentials are invalid, 2) Branch ID is wrong, 3) Product group "1200- Elon" has no products, or 4) API response structure changed.';
      console.error(`❌ ${errorMsg}`);
      console.error(`🔍 Debug info: branchId=5, productGroupId=${elonGroupId}`);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
          synced: 0,
          errors: 0,
          debugInfo: {
            branchId: 5,
            productGroupId: elonGroupId,
            elonGroup: elonGroup,
            responseStructure: Object.keys(result.data || {})
          }
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
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

        // Använd itemNumber som primär ID (t.ex. "1201" istället för FDT's interna ID)
        const primaryArticleId = articleNumber || String(articleId);
        
        // Sök på BÅDE fdt_sellus_article_id OCH barcode för att hitta befintlig produkt
        const { data: existingProduct } = await supabaseClient
          .from('products')
          .select('id, fdt_sellus_article_id, barcode')
          .or(`fdt_sellus_article_id.eq.${primaryArticleId},barcode.eq.${barcode || articleNumber},barcode.eq.${articleNumber || barcode}`)
          .maybeSingle();

        const productData = {
          name,
          barcode: barcode || articleNumber,
          category,
          description,
          min_stock: minStock,
          unit,
          fdt_sellus_article_id: primaryArticleId,
          purchase_price: purchasePrice,
          sales_price: salesPrice,
          fdt_sync_status: 'synced',
          fdt_last_synced: new Date().toISOString(),
        };

        if (existingProduct) {
          const { error: updateError } = await supabaseClient
            .from('products')
            .update(productData)
            .eq('id', existingProduct.id);
          
          if (updateError) {
            console.error(`❌ Error updating product:`, updateError);
            // Lägg ändå till i syncedArticleIds - produkten finns i FDT även om update misslyckades
            syncedArticleIds.push(primaryArticleId);
            
            await logSync(supabaseClient, {
              sync_type: 'product',
              direction: 'sellus_to_wms',
              fdt_article_id: primaryArticleId,
              status: 'error',
              error_message: updateError.message,
              request_payload: article,
              duration_ms: 0,
            });
            
            errorCount++;
            continue;
          }
          console.log(`✏️ Updated product: ${name} (${primaryArticleId})`);
        } else {
          const { error: insertError } = await supabaseClient
            .from('products')
            .insert(productData);
          
          if (insertError) {
            console.error(`❌ Error inserting product:`, insertError);
            
            // VIKTIGT: Om det är duplicate key error, lägg ändå till i syncedArticleIds
            // eftersom produkten FINNS i FDT (även om vi inte kunde skapa/uppdatera den)
            if (insertError.code === '23505') {
              console.warn(`⚠️ Product already exists (duplicate key), adding to synced list anyway: ${primaryArticleId}`);
              syncedArticleIds.push(primaryArticleId);
            }
            
            await logSync(supabaseClient, {
              sync_type: 'product',
              direction: 'sellus_to_wms',
              fdt_article_id: primaryArticleId,
              status: 'error',
              error_message: insertError.message,
              request_payload: article,
              duration_ms: 0,
            });
            
            errorCount++;
            continue;
          }
          console.log(`➕ Created product: ${name} (${primaryArticleId})`);
        }

        await logSync(supabaseClient, {
          sync_type: 'product',
          direction: 'sellus_to_wms',
          fdt_article_id: primaryArticleId,
          status: 'success',
          response_payload: article,
          duration_ms: result.duration,
        });

        syncedCount++;
        syncedArticleIds.push(primaryArticleId);
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

    // VIKTIGT: Om för många fel uppstod, hoppa över cleanup för att undvika dataförlust
    if (errorCount > syncedCount && errorCount > 2) {
      console.warn(`⚠️ Too many errors (${errorCount} errors vs ${syncedCount} synced)`);
      console.warn(`⚠️ Skipping cleanup to prevent data loss`);
      
      return new Response(
        JSON.stringify({
          success: false,
          message: `Sync completed with too many errors (${errorCount}), cleanup skipped`,
          synced: syncedCount,
          errors: errorCount,
          cleanupSkipped: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Rensa endast produkter som verkligen inte finns i FDT längre
    console.log('🧹 Cleaning up products that are no longer in FDT varugrupp 1200...');
    let deletedCount = 0;
    let inactivatedCount = 0;

    if (syncedArticleIds.length > 0) {
      // Hämta produkter som:
      // 1. Har fdt_sellus_article_id satt (dvs är synkade från FDT)
      // 2. INTE finns i listan över artiklar vi just synkade från FDT
      // 3. Inte redan är inaktiva
      const { data: productsToRemove } = await supabaseClient
        .from('products')
        .select('id, name, fdt_sellus_article_id, barcode, fdt_sync_status')
        .not('fdt_sellus_article_id', 'is', null) // Endast FDT-produkter
        .not('fdt_sellus_article_id', 'in', `(${syncedArticleIds.join(',')})`)
        .neq('fdt_sync_status', 'inactive'); // Hoppa över redan inaktiverade

      if (productsToRemove && productsToRemove.length > 0) {
        console.log(`🧹 Found ${productsToRemove.length} products not in current FDT sync`);
        console.log(`📋 Synced article IDs: ${syncedArticleIds.join(', ')}`);
        console.log(`📋 Products to review:`, productsToRemove.map(p => `${p.fdt_sellus_article_id}:${p.name}`).join(', '));

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
            console.log(`⚠️ Inactivated: ${product.fdt_sellus_article_id} (${product.name}) - in use`);
          } else {
            // Product not in use - delete
            await supabaseClient
              .from('products')
              .delete()
              .eq('id', product.id);

            deletedCount++;
            console.log(`🗑️ Deleted: ${product.fdt_sellus_article_id} (${product.name}) - not in use`);
          }
        }

        console.log(`✅ Cleanup done: ${deletedCount} deleted, ${inactivatedCount} inactivated`);
      } else {
        console.log('✅ No products to clean up - all FDT products are in sync');
      }
    } else {
      console.log('⚠️ No products were synced, skipping cleanup');
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
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
