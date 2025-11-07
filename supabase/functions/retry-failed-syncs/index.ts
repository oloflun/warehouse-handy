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

    console.log('🔄 Starting retry of failed Sellus syncs...');

    // Fetch unresolved sync failures (max 3 retries)
    const { data: failures, error: fetchError } = await supabaseClient
      .from('sellus_sync_failures')
      .select('*')
      .is('resolved_at', null)
      .order('created_at', { ascending: true })
      .limit(50); // Process max 50 at a time

    if (fetchError) {
      console.error('❌ Failed to fetch sync failures:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch sync failures' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!failures || failures.length === 0) {
      console.log('✅ No failed syncs to retry');
      return new Response(
        JSON.stringify({ success: true, message: 'No failed syncs to retry', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${failures.length} failed syncs to retry`);

    let resolved = 0;
    let stillFailing = 0;
    const errors: string[] = [];

    for (const failure of failures) {
      try {
        console.log(`🔄 Retrying sync for product: ${failure.product_name} (${failure.product_id})`);

        // First, try to auto-resolve numeric ID if missing
        if (failure.product_id) {
          console.log(`🔍 Attempting to auto-resolve numeric ID...`);
          const resolveResponse = await supabaseClient.functions.invoke('auto-resolve-item-id', {
            body: { productId: failure.product_id }
          });

          if (resolveResponse.error) {
            console.error(`⚠️ Failed to auto-resolve ID (invoke error):`, resolveResponse.error);
          } else if (resolveResponse.data?.success && resolveResponse.data?.numericId) {
            console.log(`✅ Auto-resolved numeric ID: ${resolveResponse.data.numericId}`);
          } else if (resolveResponse.data?.error) {
            console.error(`⚠️ Failed to auto-resolve ID:`, resolveResponse.data.error);
          }
        }

        // Now try to sync stock again
        console.log(`📦 Retrying stock update...`);
        const syncResponse = await supabaseClient.functions.invoke('update-sellus-stock', {
          body: { 
            productId: failure.product_id,
            quantity: failure.quantity_changed,
            orderNumber: failure.order_number
          }
        });

        if (syncResponse.error) {
          console.error(`❌ Retry failed:`, syncResponse.error);
          stillFailing++;
          errors.push(`${failure.product_name}: ${syncResponse.error.message || 'Unknown error'}`);
        } else if (syncResponse.data?.success) {
          console.log(`✅ Retry succeeded! Marking as resolved.`);
          
          // Mark as resolved
          const { error: updateError } = await supabaseClient
            .from('sellus_sync_failures')
            .update({ 
              resolved_at: new Date().toISOString(),
              resolved_by: null // Auto-resolved by system
            })
            .eq('id', failure.id);

          if (updateError) {
            console.error('⚠️ Failed to mark as resolved:', updateError);
          } else {
            resolved++;
          }
        } else {
          console.log(`⚠️ Retry returned unsuccessful response`);
          stillFailing++;
        }

      } catch (error) {
        console.error(`❌ Error retrying sync for ${failure.product_name}:`, error);
        stillFailing++;
        errors.push(`${failure.product_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Retry complete: ${resolved} resolved, ${stillFailing} still failing (${duration}ms)`);

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: failures.length,
        resolved,
        stillFailing,
        errors: errors.length > 0 ? errors : undefined,
        duration_ms: duration
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in retry-failed-syncs:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
