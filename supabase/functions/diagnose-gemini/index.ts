import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    
    // Check environment configuration
    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        GOOGLE_AI_API_KEY: GOOGLE_AI_API_KEY ? {
          configured: true,
          length: GOOGLE_AI_API_KEY.length,
          prefix: GOOGLE_AI_API_KEY.substring(0, 10) + '...',
          startsWithAIza: GOOGLE_AI_API_KEY.startsWith('AIza')
        } : {
          configured: false,
          error: 'NOT SET - This is required for scanning features!'
        }
      },
      tests: {} as any
    };

    // Test: Check if Gemini API is accessible with multiple scenarios
    if (GOOGLE_AI_API_KEY) {
      // Test 1: Text-only to verify API key works
      try {
        console.log('Test 1: Basic API key validation...');
        const textTest = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_AI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Respond with only: OK' }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 10 }
            }),
          }
        );

        if (!textTest.ok) {
          const errorText = await textTest.text();
          diagnostics.tests.apiKeyValidation = {
            success: false,
            status: textTest.status,
            error: errorText,
            message: textTest.status === 401 ? 'Invalid API key'
              : textTest.status === 403 ? 'API key lacks permissions'
              : textTest.status === 404 ? 'Model not found - gemini-2.0-flash-exp may not be available'
              : 'API error'
          };
        } else {
          const data = await textTest.json();
          diagnostics.tests.apiKeyValidation = {
            success: true,
            note: '✅ API key is valid and working'
          };
        }
      } catch (error) {
        diagnostics.tests.apiKeyValidation = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 2: Vision API with simple image
      try {
        console.log('Test 2: Vision API with test image...');
        // 1x1 red pixel JPEG
        const testImageBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
        
        const visionTest = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_AI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: 'What color is this image?' },
                  { inline_data: { mime_type: 'image/jpeg', data: testImageBase64 } }
                ]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 50 }
            }),
          }
        );

        if (!visionTest.ok) {
          const errorText = await visionTest.text();
          diagnostics.tests.visionAPI = {
            success: false,
            status: visionTest.status,
            error: errorText
          };
        } else {
          const data = await visionTest.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          const finishReason = data.candidates?.[0]?.finishReason;
          
          diagnostics.tests.visionAPI = {
            success: true,
            response: content || 'NO CONTENT',
            finishReason,
            rawResponse: data,
            note: content ? '✅ Vision API working' : '⚠️ API responded but no content'
          };
        }
      } catch (error) {
        diagnostics.tests.visionAPI = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 3: JSON response format (like actual scanning)
      try {
        console.log('Test 3: JSON response format test...');
        const jsonTest = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_AI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `Return ONLY valid JSON (no markdown): {"test": "value", "numbers": [1, 2, 3]}`
                }]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
            }),
          }
        );

        if (jsonTest.ok) {
          const data = await jsonTest.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (content) {
            try {
              // Try to parse as JSON (removing markdown if present)
              const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
              const parsed = JSON.parse(cleanContent);
              diagnostics.tests.jsonFormatTest = {
                success: true,
                note: '✅ Gemini returns parseable JSON',
                parsed
              };
            } catch (parseError) {
              diagnostics.tests.jsonFormatTest = {
                success: false,
                note: '⚠️ Gemini response not valid JSON',
                rawResponse: content,
                error: parseError instanceof Error ? parseError.message : 'Parse error'
              };
            }
          }
        }
      } catch (error) {
        diagnostics.tests.jsonFormatTest = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    } else {
      diagnostics.tests.geminiVisionAPI = {
        success: false,
        error: 'GOOGLE_AI_API_KEY not configured',
        instructions: 'Configure in Supabase Dashboard → Settings → Edge Functions → Environment Variables',
        getKeyFrom: 'https://aistudio.google.com/app/apikey'
      };
    }

    const elapsed = Date.now() - startTime;
    
    const recommendations = [];
    
    if (!GOOGLE_AI_API_KEY) {
      recommendations.push('❌ CRITICAL: GOOGLE_AI_API_KEY is NOT configured!');
      recommendations.push('Get API key from: https://aistudio.google.com/app/apikey');
      recommendations.push('Add in: Supabase Dashboard → Settings → Edge Functions → Environment Variables');
      recommendations.push('Variable name: GOOGLE_AI_API_KEY');
      recommendations.push('Wait 2-5 minutes after adding for changes to take effect');
    } else if (diagnostics.tests.geminiVisionAPI?.success) {
      recommendations.push('✅ Gemini API is working correctly!');
      recommendations.push('If scanning still fails:');
      recommendations.push('  1. Check image quality (not too dark/blurry)');
      recommendations.push('  2. Try with a clearer image');
      recommendations.push('  3. Check edge function logs in Supabase');
    } else {
      recommendations.push('❌ Fix Gemini API configuration');
      recommendations.push('Check the error details above');
      recommendations.push('Verify API key is correct and has permissions');
    }
    
    return new Response(
      JSON.stringify({
        diagnostics,
        recommendations,
        elapsed: `${elapsed}ms`,
        status: 'complete'
      }, null, 2),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Diagnostic function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  }
});
