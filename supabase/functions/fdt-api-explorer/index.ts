import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExplorerRequest {
  endpoint: string;
  method?: string;
  body?: any;
}

async function tryFetchWithAuth(url: string, method: string, body: any, authHeader: { [key: string]: string }) {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  return await fetch(url, options);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const { endpoint, method = 'GET', body }: ExplorerRequest = await req.json();
    
    console.log(`[FDT Explorer] Testing endpoint: ${method} ${endpoint}`);

    const baseUrl = Deno.env.get('FDT_SELLUS_BASE_URL');
    const apiKey = Deno.env.get('FDT_SELLUS_API_KEY');

    if (!baseUrl) {
      throw new Error('FDT_SELLUS_BASE_URL not configured');
    }

    // Clean endpoint (remove leading slash if present)
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const fullUrl = `${baseUrl}/${cleanEndpoint}`;

    console.log(`[FDT Explorer] Full URL: ${fullUrl}`);

    // Try different auth strategies
    const authStrategies = [
      { name: 'Bearer Token', header: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : null },
      { name: 'X-API-Key', header: apiKey ? { 'X-API-Key': apiKey } : null },
      { name: 'No Auth', header: {} },
    ];

    let lastError = null;
    let successResponse = null;
    let usedStrategy = '';

    for (const strategy of authStrategies) {
      if (!strategy.header && strategy.name !== 'No Auth') continue;

      console.log(`[FDT Explorer] Trying auth strategy: ${strategy.name}`);

      try {
        const response = await tryFetchWithAuth(fullUrl, method, body, strategy.header || {});
        const duration = Date.now() - startTime;
        
        console.log(`[FDT Explorer] ${strategy.name} - Status: ${response.status}`);

        if (response.ok) {
          const responseText = await response.text();
          let responseData;
          
          try {
            responseData = responseText ? JSON.parse(responseText) : null;
          } catch {
            responseData = responseText;
          }

          successResponse = {
            success: true,
            status: response.status,
            statusText: response.statusText,
            data: responseData,
            authStrategy: strategy.name,
            duration_ms: duration,
            url: fullUrl,
            method,
          };

          // Log to database
          const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          );

          await supabase.from('fdt_sync_log').insert({
            sync_type: 'api_explorer',
            direction: 'fdt_to_wms',
            status: 'success',
            request_payload: { endpoint, method, body },
            response_payload: responseData,
            duration_ms: duration,
          });

          break;
        } else {
          lastError = {
            status: response.status,
            statusText: response.statusText,
            strategy: strategy.name,
          };
        }
      } catch (error) {
        console.error(`[FDT Explorer] ${strategy.name} failed:`, error);
        lastError = {
          error: error.message,
          strategy: strategy.name,
        };
      }
    }

    if (successResponse) {
      return new Response(JSON.stringify(successResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All strategies failed
    const duration = Date.now() - startTime;
    return new Response(
      JSON.stringify({
        success: false,
        error: 'All authentication strategies failed',
        lastError,
        duration_ms: duration,
        url: fullUrl,
        method,
      }),
      {
        status: lastError?.status || 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[FDT Explorer] Error:', error);
    const duration = Date.now() - startTime;
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        duration_ms: duration,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
