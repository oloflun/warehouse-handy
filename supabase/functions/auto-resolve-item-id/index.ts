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

    console.log(`🔎 Fetching all items from Sellus to resolve ID for article: ${product.fdt_sellus_article_id}`);

    // Fetch all items from Sellus
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
    for (const item of itemsResponse.data) {
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
      response_payload: { numericId },
      duration_ms: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        numericId,
        articleId: product.fdt_sellus_article_id,
        productName: product.name
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
