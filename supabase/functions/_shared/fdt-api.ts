interface FDTApiOptions {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
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
  
  try {
    const response = await fetch(fullUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ FDT API Error ${response.status}:`, errorText);
      console.error(`📍 Request: ${method} ${fullUrl}`);
      console.error(`⏱️ Duration: ${duration}ms`);
      throw new Error(`FDT API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(`✅ FDT API Success - Duration: ${duration}ms`);
    
    return {
      success: true,
      data,
      duration,
    };
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
