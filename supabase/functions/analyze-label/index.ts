import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { image } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({
          error: 'No image provided',
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: ['No image provided']
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
          error: 'GEMINI_API_KEY is not configured. Please add it to Supabase Edge Function environment variables.',
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: ['GEMINI_API_KEY not configured']
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log("Analyzing label...");

    const systemPrompt = `Du är en expert på att läsa produktetiketter och försändelseetiketter med EXTREM PRECISION. 

KRITISKA INSTRUKTIONER:

1. **Artikelnummer (HÖGSTA PRIORITET)**:
   - Extrahera ALLA artikelnummer EXAKT som de visas
   - Kontrollera varje siffra och tecken NOGGRANT
   - "149216" är INTE samma som "149126" - var EXTREMT noggrann med siffror
   - Leta efter: streckkoder, "Art.nr", "Item", "SKU", "Model", eller numeriska/alfanumeriska koder
   - Inkludera även delvis synlig text om den är läsbar

2. **Produktnamn**:
   - Extrahera alla produktbeskrivningar/namn
   - Leta efter märke, modell, specifikationer
   - Inkludera relevanta detaljer (storlek, färg, typ)

3. **Hantera svåra fall**:
   - Lutande/vridna etiketter: läs text i alla riktningar
   - Suddig text: gör ditt bästa för att tolka korrekt
   - Dålig belysning: fokusera på kontraster
   - Vertikal text: rotera mentalt och läs korrekt
   - Delvis synlig text: extrahera vad som är tydligt läsbart

4. **Kvalitetskontroll**:
   - Dubbelkolla alla sifferkombinationer
   - Om osäker på en siffra, inkludera ändå men markera låg confidence
   - Prioritera precision över kvantitet

**VIKTIGT**: Var extremt noggrann med siffror som 1/I, 0/O, 6/8, 2/Z för att undvika förväxlingar.

Analysera denna produktetikett med MAXIMAL NOGGRANNHET:

1. Extrahera ALLA artikelnummer - var EXTREMT noggrann med varje siffra
2. Extrahera ALLA produktnamn och beskrivningar
3. Om etiketten är lutad/vriden, läs ändå all text
4. Om text är delvis synlig, extrahera det som är läsbart
5. Dubbelkolla alla sifferkombinationer för precision

OBS: Artikelnummer som "149216" och "149126" är OLIKA - var extremt noggrann!

Return ONLY valid JSON in this exact format (no markdown, no explanations):
{
  "article_numbers": ["string array of all article numbers found"],
  "product_names": ["string array of all product names found"],
  "confidence": "high|medium|low",
  "warnings": ["optional array of reading difficulties"]
}`;

    // Format for Google Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: systemPrompt
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: image.split(',')[1] // Remove data:image/jpeg;base64, prefix
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);

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
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: [errorMessage]
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
            ? 'Response blocked by safety filters. Try a clearer image or different angle.'
            : finishReason === 'MAX_TOKENS'
              ? 'Response too long. Try scanning a smaller area.'
              : `Finish reason: ${finishReason}`,
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: [`API finish reason: ${finishReason}`],
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
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: ['No response content from Gemini API'],
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
    let result;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log('Attempting to parse cleaned content:', cleanContent);
      result = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', content);
      console.error('Parse error:', parseError);
      return new Response(
        JSON.stringify({
          error: 'Failed to parse Gemini response as JSON',
          details: content,
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: ['Failed to parse Gemini response']
        }),
        {
          status: 502, // Upstream returned invalid format
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Label analyzed in ${elapsed}ms`);
    console.log("Extracted data:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Error in analyze-label after ${elapsed}ms:`, error);

    // Always return 200 with error details in body
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        article_numbers: [],
        product_names: [],
        confidence: "low",
        warnings: ["Analysis failed: " + (error instanceof Error ? error.message : "Unknown error")]
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
