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
          error: 'No image data provided',
          deliveryNoteNumber: '',
          cargoMarking: null,
          items: []
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: 'GEMINI_API_KEY not configured. Please add it to Supabase Edge Function environment variables.',
          deliveryNoteNumber: '',
          cargoMarking: null,
          items: []
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
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

      // Special handling for rate limit errors (429)
      let errorMessage = `Gemini API error: ${response.status}`;
      let userFriendlyMessage = errorText;
      let status = 502; // Default to Bad Gateway for upstream errors

      if (response.status === 429) {
        status = 429;
        errorMessage = 'Gemini API rate limit exceeded';
        userFriendlyMessage = 'API-gränsen har nåtts. Vänta några minuter eller kontakta administratören för att öka kvoten. Tips: Använd manuell artikelnummerinmatning tills vidare.';

        // Try to extract retry time if available
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            const retryMatch = errorData.error.message.match(/retry in (\d+\.?\d*)/i);
            if (retryMatch) {
              const retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
              userFriendlyMessage = `API-gränsen har nåtts. Försök igen om ${retrySeconds} sekunder. Tips: Använd manuell artikelnummerinmatning tills vidare.`;
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          details: userFriendlyMessage,
          deliveryNoteNumber: '',
          cargoMarking: null,
          items: []
        }),
        {
          status: status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await response.json();
    console.log('Raw Gemini API response:', JSON.stringify(data, null, 2));

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason = data.candidates?.[0]?.finishReason;

    // Check for safety blocks or other issues
    if (finishReason && finishReason !== 'STOP') {
      console.error('Gemini finished with reason:', finishReason);
      return new Response(
        JSON.stringify({
          error: `Gemini API blocked or failed: ${finishReason}`,
          details: finishReason === 'SAFETY'
            ? 'Response blocked by safety filters. Try a clearer image.'
            : finishReason === 'MAX_TOKENS'
              ? 'Response too long. Try scanning a smaller delivery note.'
              : `Finish reason: ${finishReason}`,
          deliveryNoteNumber: '',
          cargoMarking: null,
          items: [],
          rawResponse: data
        }),
        {
          status: 502, // Upstream issue
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!content) {
      console.error('No content in Gemini response, full response:', data);
      return new Response(
        JSON.stringify({
          error: 'No response content from Gemini API',
          details: 'API returned successfully but no text content was found',
          deliveryNoteNumber: '',
          cargoMarking: null,
          items: [],
          rawResponse: data
        }),
        {
          status: 502, // Upstream issue
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Gemini text response:', content);

    // Parse the JSON response
    let parsedData;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log('Attempting to parse cleaned content:', cleanContent);
      parsedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', content);
      console.error('Parse error:', parseError);
      return new Response(
        JSON.stringify({
          error: 'Failed to parse response as JSON',
          details: content,
          deliveryNoteNumber: '',
          cargoMarking: null,
          items: []
        }),
        {
          status: 502, // Upstream returned invalid format
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate the structure
    if (!parsedData.deliveryNoteNumber || !Array.isArray(parsedData.items)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid response structure',
          details: 'Missing deliveryNoteNumber or items array',
          deliveryNoteNumber: '',
          cargoMarking: null,
          items: []
        }),
        {
          status: 502, // Upstream returned invalid structure
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

    // Return 500 for internal errors
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined,
        deliveryNoteNumber: '',
        cargoMarking: null,
        items: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
