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
    const { imageData } = await req.json();
    
    if (!imageData) {
      throw new Error('No image data provided');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Analyzing delivery note with AI...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a delivery note analyzer. Extract structured data from delivery note images with STRICT ACCURACY.

CRITICAL INSTRUCTIONS:
1. Extract the exact delivery note number (följesedelsnummer)
2. Extract cargo marking (godsmärkning) if present
3. For EACH article/item on the delivery note, extract:
   - Article number (artikelnummer) - EXACT match
   - Order number (beställningsnummer) if present
   - Description (beskrivning)
   - Quantity (antal) as an integer

Return a JSON object with this EXACT structure:
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

Be PRECISE. If you cannot read something clearly, return null for that field.
ALWAYS return valid JSON. No markdown, no explanations.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this delivery note image and extract all information according to the format specified.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    console.log('AI response:', content);

    // Parse the JSON response
    let parsedData;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate the structure
    if (!parsedData.deliveryNoteNumber || !Array.isArray(parsedData.items)) {
      throw new Error('Invalid response structure from AI');
    }

    console.log('Successfully analyzed delivery note:', parsedData.deliveryNoteNumber);
    console.log('Found items:', parsedData.items.length);

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-delivery-note:', error);
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
