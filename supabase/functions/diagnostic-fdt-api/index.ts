const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get all environment variables related to FDT
    const baseUrl = Deno.env.get('FDT_SELLUS_BASE_URL');
    const apiKey = Deno.env.get('FDT_SELLUS_API_KEY');
    const branchId = Deno.env.get('FDT_SELLUS_BRANCH_ID');

    // Get test endpoint from request
    const { testEndpoint = '/productgroups' } = await req.json().catch(() => ({}));

    // Construct the full URL
    const fullUrl = baseUrl ? `${baseUrl}${testEndpoint}` : 'BASE_URL_NOT_SET';

    // Test the actual fetch
    let fetchResult = null;
    let fetchError = null;

    if (baseUrl && apiKey) {
      try {
        console.log(`🧪 Diagnostic Test: GET ${fullUrl}`);
        console.log(`🔑 API Key present: ${apiKey ? 'YES (length: ' + apiKey.length + ')' : 'NO'}`);

        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
        });

        const responseText = await response.text();
        
        fetchResult = {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          bodyPreview: responseText.substring(0, 500),
          bodyLength: responseText.length,
        };
        
        console.log(`📊 Response: ${response.status} ${response.statusText}`);
        console.log(`📦 Body length: ${responseText.length}`);
      } catch (error) {
        fetchError = error instanceof Error ? error.message : String(error);
        console.error(`❌ Fetch error:`, error);
      }
    }

    const diagnostic = {
      configuration: {
        baseUrl: baseUrl || 'NOT_SET',
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        branchId: branchId || 'NOT_SET (defaults to 5)',
      },
      testRequest: {
        endpoint: testEndpoint,
        fullUrl,
        method: 'GET',
      },
      fetchResult,
      fetchError,
      supabaseInfo: {
        url: Deno.env.get('SUPABASE_URL') ? 'SET' : 'NOT_SET',
        serviceRole: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'NOT_SET',
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`📋 Diagnostic complete:`, JSON.stringify(diagnostic, null, 2));

    return new Response(
      JSON.stringify(diagnostic, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error(`❌ Diagnostic error:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, null, 2),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
