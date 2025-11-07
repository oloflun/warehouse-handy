import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔄 Starting batch resolution of all numeric IDs...');

    // Fetch all products that have Sellus article ID but no numeric ID
    const { data: products, error: fetchError } = await supabaseClient
      .from('products')
      .select('id, name, fdt_sellus_article_id, fdt_sellus_item_numeric_id')
      .not('fdt_sellus_article_id', 'is', null)
      .is('fdt_sellus_item_numeric_id', null);

    if (fetchError) {
      console.error('❌ Failed to fetch products:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch products' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!products || products.length === 0) {
      console.log('✅ No products need numeric ID resolution');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No products need resolution',
          stats: { total: 0, resolved: 0, failed: 0 }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Found ${products.length} products needing numeric ID resolution`);

    let resolved = 0;
    let failed = 0;
    const failures: Array<{ productId: string; productName: string; articleId: string; error: string }> = [];

    // Resolve each product
    for (const product of products) {
      console.log(`🔍 Resolving: ${product.name} (${product.fdt_sellus_article_id})`);
      
      try {
        const { data, error } = await supabaseClient.functions.invoke('auto-resolve-item-id', {
          body: { productId: product.id }
        });

        if (error) {
          console.error(`❌ Failed to resolve ${product.name}:`, error);
          failed++;
          failures.push({
            productId: product.id,
            productName: product.name,
            articleId: product.fdt_sellus_article_id,
            error: error.message || 'Unknown error'
          });
        } else if (data?.success && data?.numericId) {
          console.log(`✅ Resolved ${product.name}: ${data.numericId}`);
          resolved++;
        } else {
          console.error(`❌ Failed to resolve ${product.name}: No numeric ID returned`);
          failed++;
          failures.push({
            productId: product.id,
            productName: product.name,
            articleId: product.fdt_sellus_article_id,
            error: 'No numeric ID returned'
          });
        }
      } catch (error) {
        console.error(`❌ Exception resolving ${product.name}:`, error);
        failed++;
        failures.push({
          productId: product.id,
          productName: product.name,
          articleId: product.fdt_sellus_article_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Batch resolution completed: ${resolved} resolved, ${failed} failed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total: products.length,
          resolved,
          failed
        },
        failures: failures.length > 0 ? failures : undefined,
        duration_ms: duration
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in batch-resolve-all-ids:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
