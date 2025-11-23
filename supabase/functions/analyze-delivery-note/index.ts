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

CRITICAL: Swedish delivery notes have a table format. ALGORITHM:
1. Identify each HORIZONTAL ROW in the table
2. For each row from TOP to BOTTOM:
   - Find the articleNumber (left side, numeric codes like "136128", "149216", etc)
   - Find the orderNumber directly to the right in the SAME ROW (look for numeric codes like "14148", "14151", "14150", etc)
   - Find the description (product name, like "Kylskåp XRE8DX Electrolux Excellence")
   - Find the quantity (number on far right)
3. Record each row as a SEPARATE item
4. EACH ROW IS COMPLETELY INDEPENDENT

CRITICAL: The order number in row N must EXACTLY match what appears in row N. Do NOT:
- Merge order numbers from different rows
- Reorder the rows
- Skip rows
- Combine adjacent rows
- Use order numbers from other rows

CRITICAL INSTRUCTIONS:

1. **Supplier Name**: Extract the company/supplier name (usually displayed prominently at the top of the delivery note, often as a logo or header. Examples: "Elon Group", "Miele", "Electrolux", etc.)

2. **Delivery Note Number**: Extract the exact följesedelsnummer (usually at the top right, labeled "Följesedel")

3. **Cargo Marking (Godsmärkning)**:
   - DO NOT use phone numbers or contact information as godsmärkning
   - Look for "Godsmärkning rad" or "Godsmärkning huvud" in the item rows
   - This is typically a short alphanumeric code (e.g., "031-68", "24 22", "MR")
   - If different items have different godsmärkning values, use the one from each item row
   - If godsmärkning is missing, a letter combination (often initials), or clearly wrong → set to null

4. **For EACH article/item row, extract - CRITICAL VALIDATION**:

   Process EACH ROW IN SEQUENCE from top to bottom:

   - **articleNumber**: The artikelnummer from THIS row ONLY
     * Look for 5-6 digit codes like "136128", "149216", "124352", "149881", etc
     * Be EXTREMELY precise - "149216" ≠ "149126" ≠ "149216"
     * VERIFY: Is this number in the SAME HORIZONTAL ROW as the order number I'm about to extract?
     * Copy the article number from left side of this row

   - **orderNumber**: The order number from THIS ROW ONLY - CRITICAL VALIDATION
     * Look for 5-digit order codes like "14148", "14151", "14150", "14152", etc in the right section of THIS row
     * VALIDATION STEP: The order number you extract MUST:
       1. Be in the EXACT SAME ROW as the articleNumber
       2. NOT appear in any previous rows you've already processed
       3. If same article appears multiple times, each instance gets its own order number from its own row
     * If row has no order number, set to null
     * If multiple order numbers in same cell (rare), separate with COMMA: "14148,14149"

   - **description**: Product name from THIS row (e.g., "Kylskåp XRE8DX Electrolux Excellence")
     * Must be in SAME ROW as the article number and order number

   - **quantity**: Number from THIS row's quantity column

5. **FINAL VALIDATION - Before returning results**:
   - Check that each item's orderNumber appears ONLY ONCE in the entire output (unless same article legitimately appears twice)
   - If an article appears multiple times with the SAME order number, that's OK - it means multiple rows had the same order
   - If an article appears multiple times with DIFFERENT order numbers, that's also OK - each row maintains its own order
   - Check that NO order numbers were merged or reordered
   - If you notice an article appears multiple times but the order numbers seem scrambled, STOP and re-read the table carefully row by row

6. **Handle edge cases**:
   - Tilted or angled images: work harder to read rotated/skewed text
   - Partially visible text: extract what you can see clearly
   - Similar numbers: double-check digit-by-digit (149216 ≠ 149126)
   - Same article appearing multiple times: This is NORMAL and expected. Extract each row separately with its own order number.
     * Example: If article 149216 appears 3 times in 3 different rows with orders 14151, 14150, 14150 → Return 3 separate items
     * Each row maintains its exact order number from that specific row
   - Missing godsmärkning: if item has no godsmärkning or column is empty, set orderNumber to null

**Return ONLY valid JSON** (no markdown, no explanations):
{
  "supplierName": "string or null",
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

CONCRETE EXAMPLE - Elon Group delivery note:
Table rows from top to bottom:
  Row 1: Art 136128, Order 14148, Desc "Tilbehør køltskakaizer Stacking Elite Master Elite", Qty 1
  Row 2: Art 149216, Order 14151, Desc "Kylskåp XRE8DX Electrolux Excellence", Qty 1
  Row 3: Art 149216, Order 14150, Desc "Kylskåp XRE8DX Electrolux Excellence", Qty 1
  Row 4: Art 149216, Order 14150, Desc "Kylskåp XRE8DX Electrolux Excellence", Qty 1
  Row 5: Art 124352, Order 14152, Desc "Tvättmaskin VG64G27D7N Siemens entalssäde", Qty 1
  Row 6: Art 149881, Order 14153, Desc "Spis XDTI1500 Electrolux Excellence", Qty 1

Return 6 SEPARATE items IN THIS EXACT ORDER:
  {"articleNumber": "136128", "orderNumber": "14148", "description": "Tilbehør køltskakaizer Stacking Elite Master Elite", "quantity": 1}
  {"articleNumber": "149216", "orderNumber": "14151", "description": "Kylskåp XRE8DX Electrolux Excellence", "quantity": 1}
  {"articleNumber": "149216", "orderNumber": "14150", "description": "Kylskåp XRE8DX Electrolux Excellence", "quantity": 1}
  {"articleNumber": "149216", "orderNumber": "14150", "description": "Kylskåp XRE8DX Electrolux Excellence", "quantity": 1}
  {"articleNumber": "124352", "orderNumber": "14152", "description": "Tvättmaskin VG64G27D7N Siemens entalssäde", "quantity": 1}
  {"articleNumber": "149881", "orderNumber": "14153", "description": "Spis XDTI1500 Electrolux Excellence", "quantity": 1}

KEY OBSERVATIONS:
- Rows are processed TOP to BOTTOM in order
- Article 149216 appears 3 times with orders 14151, 14150, 14150 - this is CORRECT, NOT an error
- Each row maintains its own exact order number - NO merging, NO reordering
- Order 14148 is in row 1, order 14151 is in row 2 (NOT row 1)

ACCURACY IS CRITICAL. If unclear, return null for that field.`;

    const userPrompt = 'Analyze this delivery note image and extract all information according to the format specified.';

    // Format for Google Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
