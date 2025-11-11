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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log("Analyzing label with AI...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Du är en expert på att läsa produktetiketter och försändelseetiketter med EXTREM PRECISION. 

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

**VIKTIGT**: Var extremt noggrann med siffror som 1/I, 0/O, 6/8, 2/Z för att undvika förväxlingar.`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: image }
              },
              {
                type: "text",
                text: `Analysera denna produktetikett med MAXIMAL NOGGRANNHET:

1. Extrahera ALLA artikelnummer - var EXTREMT noggrann med varje siffra
2. Extrahera ALLA produktnamn och beskrivningar
3. Om etiketten är lutad/vriden, läs ändå all text
4. Om text är delvis synlig, extrahera det som är läsbart
5. Dubbelkolla alla sifferkombinationer för precision

OBS: Artikelnummer som "149216" och "149126" är OLIKA - var extremt noggrann!`
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_label_info",
              description: "Extract article numbers and product names from a shipping/product label",
              parameters: {
                type: "object",
                properties: {
                  article_numbers: {
                    type: "array",
                    items: { type: "string" },
                    description: "All article numbers, SKUs, or item codes found (EXACT digits/characters)"
                  },
                  product_names: {
                    type: "array",
                    items: { type: "string" },
                    description: "All product names/descriptions found"
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "Confidence in extraction: high=clear text, medium=some blur/angle, low=difficult to read"
                  },
                  warnings: {
                    type: "array",
                    items: { type: "string" },
                    description: "List any reading difficulties: tilted, blurry, partial, poor lighting, etc."
                  }
                },
                required: ["article_numbers", "product_names", "confidence"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_label_info" } },
        temperature: 0.1, // Lower temperature for more consistent results
        max_tokens: 500   // Reduce tokens for faster response
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract tool call results
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const result = JSON.parse(toolCall.function.arguments);
    
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
