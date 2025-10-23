import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callFDTApi, logSync } from '../_shared/fdt-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { productId, quantity, locationId } = await req.json();

    if (!productId || quantity === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: 'productId and quantity required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Updating Sellus stock for product ${productId}, quantity change: ${quantity}`);

    // Fetch product details
    const { data: product, error: productError } = await supabaseClient
      .from('products')
      .select('id, name, barcode, fdt_sellus_article_id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('Product not found:', productError);
      return new Response(
        JSON.stringify({ success: false, error: 'Product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!product.fdt_sellus_article_id) {
      console.log('⏭️ Product has no FDT article ID, skipping Sellus sync');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Product not synced to Sellus (no fdt_sellus_article_id)',
          skipped: true 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total stock across all locations
    const { data: inventoryItems } = await supabaseClient
      .from('inventory')
      .select('quantity')
      .eq('product_id', productId);

    const totalStock = inventoryItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    console.log(`📊 Total stock for ${product.name}: ${totalStock} (across all locations)`);

    // Fetch existing item data from FDT
    console.log(`🔍 Fetching existing data for article ${product.fdt_sellus_article_id}`);
    const existingDataResponse = await callFDTApi({
      endpoint: `/items/${product.fdt_sellus_article_id}`,
      method: 'GET',
    });

    if (!existingDataResponse.success) {
      console.error('Failed to fetch existing FDT data:', existingDataResponse.error);
      await logSync(supabaseClient, {
        sync_type: 'inventory_item',
        direction: 'wms_to_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: productId,
        status: 'error',
        error_message: `Failed to fetch existing data: ${existingDataResponse.error}`,
        duration_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch existing FDT data',
          details: existingDataResponse.error 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const existingData = existingDataResponse.data;

    // Update stock in FDT Sellus
    const updatePayload = {
      ...existingData,
      stock: totalStock,
    };

    console.log(`📤 Updating FDT article ${product.fdt_sellus_article_id} with stock: ${totalStock}`);

    const updateResponse = await callFDTApi({
      endpoint: `/items/${product.fdt_sellus_article_id}`,
      method: 'POST',
      body: updatePayload,
    });

    const duration = Date.now() - startTime;

    if (updateResponse.success) {
      console.log(`✅ Successfully updated stock in Sellus for ${product.name}`);

      await logSync(supabaseClient, {
        sync_type: 'inventory_item',
        direction: 'wms_to_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: productId,
        status: 'success',
        request_payload: { stock: totalStock },
        response_payload: updateResponse.data,
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Stock updated in Sellus',
          product: product.name,
          newStock: totalStock,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.error('Failed to update stock in Sellus:', updateResponse.error);

      await logSync(supabaseClient, {
        sync_type: 'inventory_item',
        direction: 'wms_to_fdt',
        fdt_article_id: product.fdt_sellus_article_id,
        wms_product_id: productId,
        status: 'error',
        error_message: updateResponse.error,
        request_payload: { stock: totalStock },
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to update stock in Sellus',
          details: updateResponse.error 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Exception in update-sellus-stock:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
