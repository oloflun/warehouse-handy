import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callFDTApi } from '../_shared/fdt-api.ts';

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
  console.log('🔄 Starting batch resolution of Sellus item IDs');

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch all products that need resolution
    const { data: products, error: fetchError } = await supabaseClient
      .from('products')
      .select('id, name, fdt_sellus_article_id, fdt_sellus_item_numeric_id')
      .not('fdt_sellus_article_id', 'is', null)
      .is('fdt_sellus_item_numeric_id', null);

    if (fetchError) {
      console.error('Error fetching products:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch products' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!products || products.length === 0) {
      console.log('✅ No products need resolution');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All products already have numeric IDs cached',
          total: 0,
          resolved: 0,
          failed: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${products.length} products to resolve`);

    // Fetch all items from Sellus once
    const branchId = Deno.env.get('FDT_SELLUS_BRANCH_ID');
    const endpoints = branchId 
      ? [`/items?branchId=${branchId}`, `/items/full?branchId=${branchId}`]
      : ['/items', '/items/full'];

    let allItems: any[] = [];
    
    for (const endpoint of endpoints) {
      console.log(`📥 Fetching from ${endpoint}`);
      const response = await callFDTApi({ endpoint, method: 'GET' });
      
      if (response.success && response.data) {
        const payload = response.data;
        const items = Array.isArray(payload) ? payload : 
                     payload.results || payload.items || payload.data || [];
        
        if (items.length > 0) {
          allItems = items;
          console.log(`✅ Fetched ${items.length} items from Sellus`);
          break;
        }
      }
    }

    if (allItems.length === 0) {
      console.error('❌ Could not fetch items from Sellus');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not fetch items from Sellus API',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build a lookup map for fast matching
    const itemMap = new Map<string, any>();
    for (const item of allItems) {
      if (item.itemNumber) {
        itemMap.set(String(item.itemNumber), item);
      }
      if (item.id) {
        itemMap.set(String(item.id), item);
      }
    }

    console.log(`🗺️ Built lookup map with ${itemMap.size} entries`);

    // Resolve each product
    let resolved = 0;
    let failed = 0;
    const updates: any[] = [];

    for (const product of products) {
      const articleId = String(product.fdt_sellus_article_id);
      const item = itemMap.get(articleId);

      if (item && item.id) {
        console.log(`✅ Resolved ${product.name}: ${articleId} -> ${item.id}`);
        updates.push({
          id: product.id,
          fdt_sellus_item_numeric_id: String(item.id),
        });
        resolved++;
      } else {
        console.warn(`⚠️ Could not resolve ${product.name}: ${articleId}`);
        failed++;
      }
    }

    // Batch update all resolved products
    if (updates.length > 0) {
      console.log(`💾 Updating ${updates.length} products...`);
      
      for (const update of updates) {
        await supabaseClient
          .from('products')
          .update({ fdt_sellus_item_numeric_id: update.fdt_sellus_item_numeric_id })
          .eq('id', update.id);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Batch resolution complete in ${duration}ms: ${resolved} resolved, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Batch resolution completed',
        total: products.length,
        resolved,
        failed,
        duration_ms: duration,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Exception in resolve-sellus-item-ids:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
