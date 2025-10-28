import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { callFDTApi, logSync } from '../_shared/fdt-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductIdRequest {
  productId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { productId } = await req.json() as ProductIdRequest;
    
    if (!productId) {
      return new Response(
        JSON.stringify({ error: 'productId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Auto-resolving numeric ID for product: ${productId}`);

    // Fetch product details
    const { data: product, error: productError } = await supabaseClient
      .from('products')
      .select('id, fdt_sellus_article_id, fdt_sellus_item_numeric_id, name')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('❌ Product not found:', productError);
      return new Response(
        JSON.stringify({ error: 'Product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already has numeric ID
    if (product.fdt_sellus_item_numeric_id) {
      console.log(`✅ Product already has numeric ID: ${product.fdt_sellus_item_numeric_id}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          numericId: product.fdt_sellus_item_numeric_id,
          cached: true 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!product.fdt_sellus_article_id) {
      console.log('⚠️ Product has no Sellus article ID');
      return new Response(
        JSON.stringify({ error: 'Product has no Sellus article ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Resolving numeric ID for article: ${product.fdt_sellus_article_id}`);
    console.log(`📦 Product: ${product.name} (${product.id})`);

    // Strategy 1: Try direct itemNumber search first (most efficient)
    console.log(`🎯 Strategy 1: Direct itemNumber search`);
    
    // Try without branch first
    try {
      console.log(`🔎 Trying: GET /items?itemNumber=${product.fdt_sellus_article_id}`);
      const directResponse = await callFDTApi({
        endpoint: `/items?itemNumber=${product.fdt_sellus_article_id}`,
        method: 'GET'
      });

      if (directResponse.success && directResponse.data) {
        const payload = directResponse.data;
        const items = Array.isArray(payload) ? payload : 
                     payload.results || payload.items || payload.data || [];
        
        if (Array.isArray(items) && items.length > 0) {
          const numericId = items[0].id?.toString();
          if (numericId) {
            console.log(`✅ Direct search SUCCESS: ${product.fdt_sellus_article_id} → ${numericId}`);
            
            // Cache the numeric ID
            const { error: updateError } = await supabaseClient
              .from('products')
              .update({ 
                fdt_sellus_item_numeric_id: numericId,
                fdt_sync_status: 'synced',
                fdt_last_synced: new Date().toISOString()
              })
              .eq('id', product.id);

            if (updateError) {
              console.error('❌ Failed to cache numeric ID:', updateError);
            }

            await logSync(supabaseClient, {
              sync_type: 'resolve_item_id',
              direction: 'from_fdt',
              fdt_article_id: product.fdt_sellus_article_id,
              wms_product_id: product.id,
              status: 'success',
              response_payload: { numericId, method: 'direct_search' },
              duration_ms: Date.now() - startTime
            });

            return new Response(
              JSON.stringify({ 
                success: true, 
                numericId,
                articleId: product.fdt_sellus_article_id,
                productName: product.name,
                method: 'direct_search'
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ Direct search without branch failed, trying with branch...`);
    }

    // Try with branch
    try {
      console.log(`🔎 Trying: GET /items?itemNumber=${product.fdt_sellus_article_id}&branchId=5`);
      const directResponse = await callFDTApi({
        endpoint: `/items?itemNumber=${product.fdt_sellus_article_id}&branchId=5`,
        method: 'GET'
      });

      if (directResponse.success && directResponse.data) {
        const payload = directResponse.data;
        const items = Array.isArray(payload) ? payload : 
                     payload.results || payload.items || payload.data || [];
        
        if (Array.isArray(items) && items.length > 0) {
          const numericId = items[0].id?.toString();
          if (numericId) {
            console.log(`✅ Direct search with branch SUCCESS: ${product.fdt_sellus_article_id} → ${numericId}`);
            
            // Cache the numeric ID
            const { error: updateError } = await supabaseClient
              .from('products')
              .update({ 
                fdt_sellus_item_numeric_id: numericId,
                fdt_sync_status: 'synced',
                fdt_last_synced: new Date().toISOString()
              })
              .eq('id', product.id);

            if (updateError) {
              console.error('❌ Failed to cache numeric ID:', updateError);
            }

            await logSync(supabaseClient, {
              sync_type: 'resolve_item_id',
              direction: 'from_fdt',
              fdt_article_id: product.fdt_sellus_article_id,
              wms_product_id: product.id,
              status: 'success',
              response_payload: { numericId, method: 'direct_search_with_branch' },
              duration_ms: Date.now() - startTime
            });

            return new Response(
              JSON.stringify({ 
                success: true, 
                numericId,
                articleId: product.fdt_sellus_article_id,
                productName: product.name,
                method: 'direct_search_with_branch'
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ Direct search with branch failed, falling back to full scan...`);
    }

    // Strategy 2: Fallback to fetching all items with pagination
    console.log(`🎯 Strategy 2: Full item scan with pagination`);
    console.log(`🔎 Fetching all items from Sellus to resolve ID for article: ${product.fdt_sellus_article_id}`);

    const itemsResponse = await callFDTApi({
      endpoint: '/items',
      method: 'GET'
    });

    if (!itemsResponse.success || !itemsResponse.data) {
      console.error('❌ Failed to fetch items from Sellus:', itemsResponse.error);
      
      await logSync(supabaseClient, {
        sync_type: 'resolve_item_id',
        direction: 'from_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: product.id,
        status: 'error',
        error_message: `Failed to fetch items: ${itemsResponse.error}`,
        duration_ms: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({ error: 'Failed to fetch items from Sellus' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build map of Sellus items
    const sellusItems = new Map();

    // Handle different response structures from FDT API
    const payload = itemsResponse.data;
    const items = Array.isArray(payload) ? payload : 
                 payload.results || payload.items || payload.data || [];

    if (!Array.isArray(items)) {
      console.error('❌ Unexpected response structure from /items:', typeof payload);
      await logSync(supabaseClient, {
        sync_type: 'resolve_item_id',
        direction: 'from_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: product.id,
        status: 'error',
        error_message: `Unexpected response structure: ${typeof payload}`,
        response_payload: payload,
        duration_ms: Date.now() - startTime
      });
      
      return new Response(
        JSON.stringify({ error: 'Unexpected response structure from Sellus API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Found ${items.length} items from Sellus`);

    for (const item of items) {
      if (item.itemNumber) {
        sellusItems.set(item.itemNumber.toString(), item.id?.toString());
      }
    }

    // Try to match product
    const numericId = sellusItems.get(product.fdt_sellus_article_id);

    if (!numericId) {
      console.log(`⚠️ No matching numeric ID found for article: ${product.fdt_sellus_article_id}`);
      
      await logSync(supabaseClient, {
        sync_type: 'resolve_item_id',
        direction: 'from_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: product.id,
        status: 'error',
        error_message: `Article ${product.fdt_sellus_article_id} not found in Sellus`,
        duration_ms: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Article not found in Sellus',
          articleId: product.fdt_sellus_article_id 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update product with numeric ID
    const { error: updateError } = await supabaseClient
      .from('products')
      .update({ 
        fdt_sellus_item_numeric_id: numericId,
        fdt_sync_status: 'synced',
        fdt_last_synced: new Date().toISOString()
      })
      .eq('id', product.id);

    if (updateError) {
      console.error('❌ Failed to update product:', updateError);
      
      await logSync(supabaseClient, {
        sync_type: 'resolve_item_id',
        direction: 'from_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: product.id,
        status: 'error',
        error_message: `Failed to update product: ${updateError.message}`,
        duration_ms: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({ error: 'Failed to update product' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Resolved and cached numeric ID: ${numericId} for article: ${product.fdt_sellus_article_id}`);

    await logSync(supabaseClient, {
      sync_type: 'resolve_item_id',
      direction: 'from_fdt',
      fdt_article_id: product.fdt_sellus_article_id,
      wms_product_id: product.id,
      status: 'success',
      response_payload: { numericId, method: 'full_scan' },
      duration_ms: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        numericId,
        articleId: product.fdt_sellus_article_id,
        productName: product.name,
        method: 'full_scan'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in auto-resolve-item-id:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
