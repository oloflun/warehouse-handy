import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { imageData } = await req.json();
    
    if (!imageData) {
      return new Response(
        JSON.stringify({ 
          error: 'No image data provided'
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!GOOGLE_AI_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: 'GOOGLE_AI_API_KEY not configured. Please add it to Supabase Edge Function environment variables.'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Analyzing delivery note...');

    const systemPrompt = `You are an expert delivery note (följesedel) analyzer for Swedish warehouse operations. Extract structured data with EXTREME ACCURACY.

CRITICAL INSTRUCTIONS:

1. **Delivery Note Number**: Extract the exact följesedelsnummer (usually at the top right, labeled "Följesedel")

2. **Cargo Marking (Godsmärkning)**: 
   - DO NOT use phone numbers or contact information as godsmärkning
   - Look for "Godsmärkning rad" or "Godsmärkning huvud" in the item rows
   - This is typically a short alphanumeric code (e.g., "031-68", "24 22", "MR")
   - If different items have different godsmärkning values, use the one from each item row
   - If godsmärkning is missing, a letter combination (often initials), or clearly wrong → set to null

3. **For EACH article/item row, extract**:
   - **articleNumber**: The exact artikelnummer (look for columns like "Art.nr", "Artikel", or numeric codes)
     * Be VERY precise - "149216" is different from "149126"
     * Include ALL digits and characters exactly as shown
   - **orderNumber**: The "Godsmärkning rad" or "Godsmärkning huvud" for THIS specific row (NOT the phone number!)
   - **description**: Product beskrivning/namn (e.g., "Kylskåp XRE8DX Electrolux Excellence")
   - **quantity**: Integer quantity (antal) to receive

4. **Handle edge cases**:
   - Tilted or angled images: work harder to read rotated/skewed text
   - Partially visible text: extract what you can see clearly
   - Similar numbers: double-check digit-by-digit (149216 ≠ 149126)
   - Missing godsmärkning: if item has no godsmärkning or it's invalid (like "MR"), set orderNumber to null

**Return ONLY valid JSON** (no markdown, no explanations):
{
  "deliveryNoteNumber": "string",
  "cargoMarking": "string or null",
  "items": [
    {
      "articleNumber": "string",
      "orderNumber": "string or null",
      "description": "string",
      "quantity": number
    }
  ]
}

ACCURACY IS CRITICAL. If unclear, return null for that field.`;

    const userPrompt = 'Analyze this delivery note image and extract all information according to the format specified.';

    // Format for Google Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\n${userPrompt}`
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: imageData.split(',')[1] // Remove data:image/jpeg;base64, prefix
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1500
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Gemini API error: ${response.status}`,
          details: errorText
        }),
        { 
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return new Response(
        JSON.stringify({ 
          error: 'No response from Gemini API'
        }),
        { 
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse the JSON response
    let parsedData;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', content);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse response as JSON',
          details: content
        }),
        { 
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate the structure
    if (!parsedData.deliveryNoteNumber || !Array.isArray(parsedData.items)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid response structure',
          details: 'Missing deliveryNoteNumber or items array'
        }),
        { 
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Delivery note analyzed in ${elapsed}ms`);
    console.log('Delivery note:', parsedData.deliveryNoteNumber);
    console.log('Found items:', parsedData.items.length);

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Error in analyze-delivery-note after ${elapsed}ms:`, error);
    
    // Return 500 for server-side errors
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
