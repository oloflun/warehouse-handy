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
            content: "Du är en expert på att läsa etiketter från produkter och försändelser. Extrahera ALLA artikelnummer och produktnamn du ser. Leta efter: streckkoder, artikelnummer (ofta med 'Art.nr', 'Item', 'SKU', eller bara siffror/bokstavskombinationer), produktnamn/beskrivningar. Var noggrann och extrahera all text som kan vara relevant."
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
                text: "Läs av denna etikett och extrahera alla artikelnummer och produktnamn du kan hitta. Inkludera även delvis synlig text som kan vara relevant."
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
                    description: "All article numbers, SKUs, or item codes found on the label"
                  },
                  product_names: {
                    type: "array",
                    items: { type: "string" },
                    description: "All product names/descriptions found"
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "AI confidence in the extraction quality"
                  }
                },
                required: ["article_numbers", "product_names", "confidence"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_label_info" } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data, null, 2));

    // Extract tool call results
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log("Extracted data:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error in analyze-label:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        article_numbers: [],
        product_names: [],
        confidence: "low"
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
