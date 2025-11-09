interface FDTApiOptions {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function callFDTApi({ endpoint, method = 'GET', body }: FDTApiOptions) {
  const baseUrl = Deno.env.get('FDT_SELLUS_BASE_URL');
  const apiKey = Deno.env.get('FDT_SELLUS_API_KEY');
  
  if (!baseUrl || !apiKey) {
    const missingVars = [];
    if (!baseUrl) missingVars.push('FDT_SELLUS_BASE_URL');
    if (!apiKey) missingVars.push('FDT_SELLUS_API_KEY');
    const errorMsg = `FDT API credentials not configured: Missing ${missingVars.join(' and ')}`;
    console.error(`❌ ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: 0,
    };
  }

  const startTime = Date.now();
  const fullUrl = `${baseUrl}${endpoint}`;
  
  console.log(`🌐 FDT API ${method} ${fullUrl}`);
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    console.log('📤 Request body:', JSON.stringify(body, null, 2));
  }
  
  // Use the Sellus API Key with Bearer token format
  console.log(`🔐 Using Authorization: Bearer {api-key}`);
  
  try {
    // Build headers - only include Content-Type for methods that have a body
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    };
    
    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
    };
    
    // Only add body and Content-Type for methods that support request bodies
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }
    
    const response = await fetch(fullUrl, fetchOptions);
    
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      console.log(`✅ FDT API Success - Duration: ${duration}ms`);
      const data = await response.json();
      return {
        success: true,
        data,
        duration,
      };
    }
    
    // Handle error responses
    const errorText = await response.text();
    let errorMsg = `FDT API error (${response.status}): ${errorText}`;
    
    if (response.status === 401) {
      const wwwAuthenticate = response.headers.get('WWW-Authenticate');
      errorMsg += ' - Authentication failed. Check FDT_SELLUS_API_KEY is correct.';
      if (wwwAuthenticate) {
        errorMsg += ` Server requires: ${wwwAuthenticate}.`;
      }
    }
    
    console.error(`❌ ${errorMsg}`);
    console.error(`📍 Request: ${method} ${fullUrl}`);
    console.error(`⏱️ Duration: ${duration}ms`);
    
    throw new Error(errorMsg);
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

// Define a minimal interface for the Supabase client operations we use
interface SupabaseClient {
  from: (table: string) => {
    insert: (data: {
      sync_type: string;
      direction: string;
      fdt_article_id?: string;
      wms_product_id?: string;
      status: string;
      request_payload?: unknown;
      response_payload?: unknown;
      error_message?: string;
      duration_ms: number;
    }) => Promise<unknown>;
  };
}

export async function logSync(supabase: SupabaseClient, logData: {
  sync_type: string;
  direction: string;
  fdt_article_id?: string;
  wms_product_id?: string;
  status: string;
  request_payload?: unknown;
  response_payload?: unknown;
  error_message?: string;
  duration_ms: number;
}) {
  await supabase.from('fdt_sync_log').insert(logData);
}
