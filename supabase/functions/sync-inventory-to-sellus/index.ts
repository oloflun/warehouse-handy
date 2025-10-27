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
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔄 Starting inventory sync to FDT Sellus...');

    // Get all products with FDT Sellus article IDs
    const { data: products, error } = await supabaseClient
      .from('products')
      .select('id, name, fdt_sellus_article_id')
      .not('fdt_sellus_article_id', 'is', null);

    if (error) throw error;

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: Array<{ product: string; error: string }> = [];

    console.log(`📦 Found ${products.length} products with Sellus article IDs`);

    for (const product of products) {
      try {
        console.log(`🔄 Syncing ${product.name} (${product.fdt_sellus_article_id})...`);

        // Call update-sellus-stock edge function for each product
        const { data: result, error: invokeError } = await supabaseClient.functions.invoke(
          'update-sellus-stock',
          {
            body: { 
              productId: product.id,
              quantity: 0 // Just trigger sync, the function will calculate total stock
            }
          }
        );

        if (invokeError) {
          throw new Error(invokeError.message);
        }

        if (result?.success) {
          if (result.skipped) {
            console.log(`⏭️ Skipped ${product.name} - ${result.message}`);
            skippedCount++;
          } else {
            console.log(`✅ Successfully synced ${product.name} - Stock: ${result.newStock}`);
            syncedCount++;
          }
        } else {
          throw new Error(result?.error || 'Unknown error');
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error syncing ${product.name}:`, errorMsg);
        errors.push({ product: product.name, error: errorMsg });
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

    console.log(`✅ Inventory sync completed: ${syncedCount} synced, ${skippedCount} skipped, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        skipped: skippedCount,
        errors: errorCount,
        errorDetails: errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Inventory sync error:', error);
    
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
