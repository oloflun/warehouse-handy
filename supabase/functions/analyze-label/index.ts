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
      throw new Error("No image provided");
    }

    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!GOOGLE_AI_API_KEY) {
      throw new Error('GOOGLE_AI_API_KEY is not configured. Please add it to Supabase Edge Function environment variables.');
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_AI_API_KEY}`,
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
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      throw new Error("No response from Gemini API");
    }

    // Parse the JSON response
    let result;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', content);
      throw new Error('Failed to parse Gemini response as JSON');
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
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        article_numbers: [],
        product_names: [],
        confidence: "low",
        warnings: ["Analysis failed: " + (error instanceof Error ? error.message : "Unknown error")]
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
