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
    const { image, model } = await req.json();
    
    if (!image) {
      return new Response(
        JSON.stringify({ 
          error: 'No image provided',
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: ['No image provided'],
          provider: 'openai'
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: 'OPENAI_API_KEY is not configured. Please add it to Supabase Edge Function environment variables.',
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: ['OPENAI_API_KEY not configured'],
          provider: 'openai'
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log("Analyzing label with OpenAI...");
    console.log("Model:", model || 'gpt-4o-mini');

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

Return ONLY valid JSON in this exact format (no markdown, no explanations):
{
  "article_numbers": ["string array of all article numbers found"],
  "product_names": ["string array of all product names found"],
  "confidence": "high|medium|low",
  "warnings": ["optional array of reading difficulties"]
}`;

    // Use specified model or default to gpt-4o-mini for cost-effectiveness
    const selectedModel = model || 'gpt-4o-mini';

    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: systemPrompt
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image, // Full data URL with base64
                    detail: "high" // High detail for better OCR
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.1,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      
      // Special handling for rate limit errors (429)
      let errorMessage = `OpenAI API error: ${response.status}`;
      let userFriendlyMessage = errorText;
      
      if (response.status === 429) {
        errorMessage = 'OpenAI API rate limit exceeded';
        userFriendlyMessage = 'API-gränsen har nåtts. Vänta några minuter eller kontakta administratören för att öka kvoten. Tips: Använd manuell artikelnummerinmatning tills vidare.';
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            const retryMatch = errorData.error.message.match(/retry after (\d+)/i);
            if (retryMatch) {
              const retrySeconds = parseInt(retryMatch[1]);
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
          warnings: [errorMessage],
          provider: 'openai',
          model: selectedModel
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    console.log('Raw OpenAI API response:', JSON.stringify(data, null, 2));
    
    const content = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason;
    
    if (finishReason && finishReason !== 'stop') {
      console.error('OpenAI finished with reason:', finishReason);
      return new Response(
        JSON.stringify({ 
          error: `OpenAI API finished with: ${finishReason}`,
          details: finishReason === 'length' 
            ? 'Response too long. Try scanning a smaller area.'
            : `Finish reason: ${finishReason}`,
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: [`API finish reason: ${finishReason}`],
          provider: 'openai',
          model: selectedModel
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    if (!content) {
      console.error('No content in OpenAI response');
      return new Response(
        JSON.stringify({ 
          error: 'No response content from OpenAI API',
          details: 'API returned successfully but no text content was found',
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: ['No response content from OpenAI API'],
          provider: 'openai',
          model: selectedModel
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log('OpenAI text response:', content);

    // Parse the JSON response
    let result;
    try {
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log('Attempting to parse cleaned content:', cleanContent);
      result = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      console.error('Parse error:', parseError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse OpenAI response as JSON',
          details: content,
          article_numbers: [],
          product_names: [],
          confidence: 'low',
          warnings: ['Failed to parse OpenAI response'],
          provider: 'openai',
          model: selectedModel
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ Label analyzed with OpenAI (${selectedModel}) in ${elapsed}ms`);
    console.log("Extracted data:", result);

    // Add provider and model info to response
    result.provider = 'openai';
    result.model = selectedModel;
    result.processingTime = elapsed;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Error in analyze-label-openai after ${elapsed}ms:`, error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        article_numbers: [],
        product_names: [],
        confidence: "low",
        warnings: ["Analysis failed: " + (error instanceof Error ? error.message : "Unknown error")],
        provider: 'openai'
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
