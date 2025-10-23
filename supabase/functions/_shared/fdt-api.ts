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
  
  // Try multiple auth strategies (ordered from most to least common)
  const authStrategies: Array<{ name: string; headers: Record<string, string> }> = [
    { name: 'Bearer', headers: { 'Authorization': `Bearer ${apiKey}` } },
    { name: 'X-Api-Key', headers: { 'X-Api-Key': apiKey } },
    { name: 'ApiKey', headers: { 'Authorization': `ApiKey ${apiKey}` } },
    { name: 'Token', headers: { 'Authorization': `Token ${apiKey}` } },
    { name: 'Ocp-Apim-Subscription-Key', headers: { 'Ocp-Apim-Subscription-Key': apiKey } },
    { name: 'x-subscription-key', headers: { 'x-subscription-key': apiKey } },
    { name: 'Subscription-Key', headers: { 'Subscription-Key': apiKey } },
    { name: 'apikey', headers: { 'apikey': apiKey } },
    { name: 'api-key', headers: { 'api-key': apiKey } },
    { name: 'X-API-KEY', headers: { 'X-API-KEY': apiKey } },
    { name: 'X-ApiKey', headers: { 'X-ApiKey': apiKey } },
    { name: 'X-Authorization', headers: { 'X-Authorization': apiKey } },
  ];
  
  let lastResponse: Response | null = null;
  let lastError: Error | null = null;
  let wwwAuthenticate: string | null = null;
  const triedStrategies: string[] = [];
  
  try {
    for (const strategy of authStrategies) {
      console.log(`🔐 Trying auth strategy: ${strategy.name}`);
      triedStrategies.push(strategy.name);
      
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
        // Capture WWW-Authenticate header for diagnostics
        if (!wwwAuthenticate) {
          wwwAuthenticate = response.headers.get('WWW-Authenticate');
          if (wwwAuthenticate) {
            console.log(`🔍 Server WWW-Authenticate: ${wwwAuthenticate}`);
          }
          const serverHeader = response.headers.get('Server');
          if (serverHeader) {
            console.log(`🔍 Server: ${serverHeader}`);
          }
        }
        console.warn(`❌ Auth failed with ${strategy.name} (401 Unauthorized)`);
        continue; // Try next strategy
      }
      
      // Non-401 error, stop trying
      break;
    }
    
    // If all header strategies failed with 401, try query parameter diagnostic
    let queryParamDiagnostic = 'not tested';
    if (lastResponse?.status === 401 && method === 'GET') {
      console.log('🔍 Running query parameter diagnostic test...');
      const queryTests = ['apiKey', 'api-key', 'token'];
      
      for (const paramName of queryTests) {
        try {
          const testUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}${paramName}=${apiKey}`;
          const testResponse = await fetch(testUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          });
          
          if (testResponse.ok) {
            queryParamDiagnostic = `SUCCESS with ?${paramName}=<key>`;
            console.log(`✅ Query param diagnostic: ${queryParamDiagnostic}`);
            break;
          } else if (testResponse.status !== 401) {
            queryParamDiagnostic = `?${paramName} gave ${testResponse.status}`;
            console.log(`🔍 Query param diagnostic: ${queryParamDiagnostic}`);
          }
        } catch (err) {
          console.error(`Error testing query param ?${paramName}:`, err);
        }
      }
      
      if (queryParamDiagnostic === 'not tested') {
        queryParamDiagnostic = 'all query params failed (401)';
      }
    }
    
    const duration = Date.now() - startTime;
    
    if (lastResponse && !lastResponse.ok) {
      const errorText = await lastResponse.text();
      let authMsg = '';
      
      if (lastResponse.status === 401) {
        authMsg = ` - All auth strategies failed (${triedStrategies.join(', ')}). Check API key and permissions.`;
        
        if (wwwAuthenticate) {
          authMsg += ` Server requires: ${wwwAuthenticate}.`;
        }
        
        if (queryParamDiagnostic !== 'not tested') {
          authMsg += ` Query param test: ${queryParamDiagnostic}.`;
        }
      }
      
      console.error(`❌ FDT API Error ${lastResponse.status}:`, errorText);
      console.error(`📍 Request: ${method} ${fullUrl}${authMsg}`);
      console.error(`⏱️ Duration: ${duration}ms`);
      
      const errorDetails = {
        status: lastResponse.status,
        message: errorText,
        authDiagnostics: lastResponse.status === 401 ? {
          triedStrategies,
          wwwAuthenticate: wwwAuthenticate || 'not provided',
          queryParamTest: queryParamDiagnostic,
        } : undefined,
      };
      
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
