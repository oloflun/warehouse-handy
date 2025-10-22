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
  
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
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
      throw new Error(`FDT API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    return {
      success: true,
      data,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
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
