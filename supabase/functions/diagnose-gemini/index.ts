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

    // Test: Check if Gemini API is accessible
    if (GOOGLE_AI_API_KEY) {
      try {
        console.log('Testing Gemini API connection...');
        
        // Test with a small image (1x1 pixel red square)
        const testImageBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
        
        const testResponse = await fetch(
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
                      text: 'Describe this test image briefly.'
                    },
                    {
                      inline_data: {
                        mime_type: 'image/jpeg',
                        data: testImageBase64
                      }
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 100
              }
            }),
          }
        );

        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          diagnostics.tests.geminiVisionAPI = {
            success: false,
            status: testResponse.status,
            statusText: testResponse.statusText,
            error: errorText,
            message: testResponse.status === 401 
              ? 'Invalid API key - Get a new one from https://aistudio.google.com/app/apikey'
              : testResponse.status === 429
              ? 'Rate limit exceeded - Wait a few minutes or upgrade your Gemini API quota'
              : testResponse.status === 403
              ? 'API key does not have permission - Check Gemini API is enabled'
              : 'API error - Check Gemini API status'
          };
        } else {
          const data = await testResponse.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          
          diagnostics.tests.geminiVisionAPI = {
            success: true,
            status: testResponse.status,
            responseReceived: !!content,
            response: content || 'NO CONTENT',
            note: '✅ Gemini Vision API is working! Scanning should work.'
          };
        }
        
      } catch (error) {
        diagnostics.tests.geminiVisionAPI = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          type: 'Network or API error'
        };
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
