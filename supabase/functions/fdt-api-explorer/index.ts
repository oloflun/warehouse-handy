import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { callFDTApi, logSync } from '../_shared/fdt-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExplorerRequest {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

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

  const startTime = Date.now();
  
  try {
    const { endpoint, method = 'GET', body }: ExplorerRequest = await req.json();
    
    console.log(`[FDT Explorer] Testing endpoint: ${method} ${endpoint}`);

    // Validate environment variables
    const baseUrl = Deno.env.get('FDT_SELLUS_BASE_URL');
    const apiKey = Deno.env.get('FDT_SELLUS_API_KEY');

    if (!baseUrl) {
      throw new Error('FDT_SELLUS_BASE_URL not configured');
    }

    if (!apiKey) {
      throw new Error('FDT_SELLUS_API_KEY not configured');
    }

    // Clean endpoint - ensure it starts with /
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    console.log(`[FDT Explorer] Calling FDT API: ${method} ${cleanEndpoint}`);

    // Use the robust shared callFDTApi function
    const result = await callFDTApi({
      endpoint: cleanEndpoint,
      method,
      body,
    });

    const duration = Date.now() - startTime;

    // Create Supabase client for logging
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (result.success) {
      // Log successful call
      await logSync(supabase, {
        sync_type: 'api_explorer',
        direction: 'fdt_to_wms',
        status: 'success',
        request_payload: { endpoint: cleanEndpoint, method, body },
        response_payload: result.data,
        duration_ms: result.duration || duration,
      });

      return new Response(
        JSON.stringify({
          success: true,
          status: 200,
          statusText: 'OK',
          data: result.data,
          duration_ms: result.duration || duration,
          url: `${baseUrl}${cleanEndpoint}`,
          method,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Log failed call
      await logSync(supabase, {
        sync_type: 'api_explorer',
        direction: 'fdt_to_wms',
        status: 'error',
        request_payload: { endpoint: cleanEndpoint, method, body },
        error_message: result.error || 'Unknown error',
        duration_ms: result.duration || duration,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: result.error || 'API call failed',
          duration_ms: result.duration || duration,
          url: `${baseUrl}${cleanEndpoint}`,
          method,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('[FDT Explorer] Error:', error);
    const duration = Date.now() - startTime;
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: duration,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
