interface FDTApiOptions {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
}

async function tryFetchWithAuthStrategy(
  url: string,
  method: string,
  body: any,
  authHeader: { [key: string]: string }
): Promise<Response> {
  return await fetch(url, {
    method,
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function callFDTApi({ endpoint, method = 'GET', body }: FDTApiOptions) {
  const baseUrl = Deno.env.get('FDT_SELLUS_BASE_URL');
  const apiKey = Deno.env.get('FDT_SELLUS_API_KEY');
  
  if (!baseUrl || !apiKey) {
    throw new Error('FDT API credentials not configured');
  }

  const startTime = Date.now();
  const fullUrl = `${baseUrl}${endpoint}`;
  
  console.log(`🌐 FDT API ${method} ${fullUrl}`);
  if (body && (method === 'POST' || method === 'PUT')) {
    console.log('📤 Request body:', JSON.stringify(body, null, 2));
  }
  
  // Try multiple auth strategies
  const authStrategies: Array<{ name: string; headers: Record<string, string> }> = [
    { name: 'Bearer', headers: { 'Authorization': `Bearer ${apiKey}` } },
    { name: 'X-Api-Key', headers: { 'X-Api-Key': apiKey } },
    { name: 'ApiKey', headers: { 'Authorization': `ApiKey ${apiKey}` } },
  ];
  
  let lastResponse: Response | null = null;
  let lastError: Error | null = null;
  
  try {
    for (const strategy of authStrategies) {
      console.log(`🔐 Trying auth strategy: ${strategy.name}`);
      
      const response = await tryFetchWithAuthStrategy(fullUrl, method, body, strategy.headers);
      lastResponse = response;
      
      if (response.ok) {
        const duration = Date.now() - startTime;
        console.log(`✅ Auth success with ${strategy.name} - Duration: ${duration}ms`);
        const data = await response.json();
        return {
          success: true,
          data,
          duration,
        };
      }
      
      if (response.status === 401) {
        console.warn(`❌ Auth failed with ${strategy.name} (401 Unauthorized)`);
        continue; // Try next strategy
      }
      
      // Non-401 error, stop trying
      break;
    }
    
    const duration = Date.now() - startTime;
    
    if (lastResponse && !lastResponse.ok) {
      const errorText = await lastResponse.text();
      const authMsg = lastResponse.status === 401 
        ? ' - All auth strategies failed (Bearer, X-Api-Key, ApiKey). Check API key and permissions.'
        : '';
      console.error(`❌ FDT API Error ${lastResponse.status}:`, errorText);
      console.error(`📍 Request: ${method} ${fullUrl}${authMsg}`);
      console.error(`⏱️ Duration: ${duration}ms`);
      throw new Error(`FDT API error (${lastResponse.status}): ${errorText}${authMsg}`);
    }
    
    throw new Error('FDT API request failed with no response');
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ FDT API Exception:`, error);
    console.error(`📍 Request: ${method} ${fullUrl}`);
    console.error(`⏱️ Duration: ${duration}ms`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    };
  }
}

export async function logSync(supabase: any, logData: {
  sync_type: string;
  direction: string;
  fdt_article_id?: string;
  wms_product_id?: string;
  status: string;
  request_payload?: any;
  response_payload?: any;
  error_message?: string;
  duration_ms: number;
}) {
  await supabase.from('fdt_sync_log').insert(logData);
}
