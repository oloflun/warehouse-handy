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
  console.log('🔍 Starting OpenAI API diagnostics...');

  try {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      environment: {},
      tests: {},
    };

    const recommendations: string[] = [];

    // 1. Check if OPENAI_API_KEY is configured
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    diagnostics.environment.OPENAI_API_KEY = {
      configured: !!OPENAI_API_KEY,
    };

    if (OPENAI_API_KEY) {
      diagnostics.environment.OPENAI_API_KEY.length = OPENAI_API_KEY.length;
      diagnostics.environment.OPENAI_API_KEY.prefix = OPENAI_API_KEY.substring(0, 7);
      diagnostics.environment.OPENAI_API_KEY.startsWithSk = OPENAI_API_KEY.startsWith('sk-');
    } else {
      diagnostics.environment.OPENAI_API_KEY.error = 'OPENAI_API_KEY environment variable is not set';
      recommendations.push('❌ Set OPENAI_API_KEY in Supabase Edge Function environment variables');
      recommendations.push('📝 Get your API key from: https://platform.openai.com/api-keys');
      recommendations.push('💡 API key should start with "sk-"');
    }

    // 2. Test API Key Validation (text-only test)
    if (OPENAI_API_KEY) {
      console.log('Testing OpenAI API key validation...');
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
        });

        diagnostics.tests.apiKeyValidation = {
          success: response.ok,
          status: response.status,
        };

        if (response.ok) {
          const data = await response.json();
          diagnostics.tests.apiKeyValidation.message = `✅ API key is valid. Found ${data.data?.length || 0} available models.`;
          diagnostics.tests.apiKeyValidation.note = 'API key authentication successful';
          
          // List some available vision models
          const visionModels = data.data?.filter((m: any) => 
            m.id.includes('gpt-4') && (m.id.includes('vision') || m.id.includes('gpt-4o'))
          ).map((m: any) => m.id).slice(0, 5);
          
          if (visionModels && visionModels.length > 0) {
            diagnostics.tests.apiKeyValidation.availableVisionModels = visionModels;
          }
        } else {
          const errorText = await response.text();
          diagnostics.tests.apiKeyValidation.error = errorText;
          diagnostics.tests.apiKeyValidation.message = '❌ API key validation failed';
          
          if (response.status === 401) {
            recommendations.push('❌ API key is invalid or has been revoked');
            recommendations.push('🔄 Generate a new API key at: https://platform.openai.com/api-keys');
          } else if (response.status === 429) {
            recommendations.push('⚠️ Rate limit exceeded');
            recommendations.push('💳 Check your usage at: https://platform.openai.com/usage');
          } else if (response.status === 403) {
            recommendations.push('❌ API key does not have permission to access this resource');
            recommendations.push('🔐 Verify API key permissions in OpenAI dashboard');
          }
        }
      } catch (error) {
        diagnostics.tests.apiKeyValidation = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: '❌ Failed to connect to OpenAI API',
        };
        recommendations.push('🌐 Check your internet connection');
        recommendations.push('🔌 Verify that Supabase can reach api.openai.com');
      }
    }

    // 3. Test Vision API with a test image
    if (OPENAI_API_KEY && diagnostics.tests.apiKeyValidation?.success) {
      console.log('Testing OpenAI Vision API...');
      
      // Test image: simple 1x1 red pixel as base64
      const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      
      try {
        const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Respond with only: "Test successful"'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: testImageBase64,
                    }
                  }
                ]
              }
            ],
            max_tokens: 50,
          }),
        });

        diagnostics.tests.visionAPI = {
          success: visionResponse.ok,
          status: visionResponse.status,
          statusText: visionResponse.statusText,
        };

        if (visionResponse.ok) {
          const data = await visionResponse.json();
          const content = data.choices?.[0]?.message?.content;
          const finishReason = data.choices?.[0]?.finish_reason;
          
          diagnostics.tests.visionAPI.response = content;
          diagnostics.tests.visionAPI.finishReason = finishReason;
          diagnostics.tests.visionAPI.message = '✅ Vision API is working correctly';
          diagnostics.tests.visionAPI.note = 'Successfully processed test image';
          diagnostics.tests.visionAPI.model = data.model;
          diagnostics.tests.visionAPI.usage = data.usage;
          
          if (finishReason !== 'stop') {
            diagnostics.tests.visionAPI.warning = `Finish reason: ${finishReason}`;
          }
        } else {
          const errorText = await visionResponse.text();
          diagnostics.tests.visionAPI.error = errorText;
          diagnostics.tests.visionAPI.message = '❌ Vision API request failed';
          
          try {
            const errorData = JSON.parse(errorText);
            diagnostics.tests.visionAPI.errorDetails = errorData;
            
            if (errorData.error?.code === 'insufficient_quota') {
              recommendations.push('💳 Insufficient quota - add billing at: https://platform.openai.com/account/billing');
            } else if (errorData.error?.code === 'model_not_found') {
              recommendations.push('🤖 Model not available - try a different model');
            }
          } catch (e) {
            // Error text is not JSON
          }
          
          if (visionResponse.status === 429) {
            recommendations.push('⏱️ Rate limit exceeded - wait before retrying');
            recommendations.push('📊 Monitor usage: https://platform.openai.com/usage');
          }
        }
      } catch (error) {
        diagnostics.tests.visionAPI = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: '❌ Vision API test failed',
        };
        recommendations.push('🌐 Network error when calling Vision API');
      }
    } else if (OPENAI_API_KEY) {
      diagnostics.tests.visionAPI = {
        success: false,
        message: '⏭️ Skipped - API key validation failed',
        note: 'Fix API key issues first',
      };
    }

    // 4. Test JSON Response Format
    if (OPENAI_API_KEY && diagnostics.tests.visionAPI?.success) {
      console.log('Testing JSON format response...');
      
      try {
        const jsonTestResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: 'Return this exact JSON: {"test": "success", "numbers": [1,2,3]}'
              }
            ],
            max_tokens: 50,
            temperature: 0,
          }),
        });

        if (jsonTestResponse.ok) {
          const data = await jsonTestResponse.json();
          const content = data.choices?.[0]?.message?.content;
          
          diagnostics.tests.jsonFormatTest = {
            success: true,
            rawResponse: content,
            note: 'Model can return JSON format',
          };
          
          try {
            const cleanContent = content?.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanContent || '{}');
            diagnostics.tests.jsonFormatTest.parsed = parsed;
            diagnostics.tests.jsonFormatTest.message = '✅ JSON parsing works correctly';
          } catch (e) {
            diagnostics.tests.jsonFormatTest.warning = 'JSON parsing needed extra cleanup';
            diagnostics.tests.jsonFormatTest.message = '⚠️ JSON format works but may need cleanup';
          }
        } else {
          diagnostics.tests.jsonFormatTest = {
            success: false,
            error: await jsonTestResponse.text(),
            message: '❌ JSON format test failed',
          };
        }
      } catch (error) {
        diagnostics.tests.jsonFormatTest = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: '❌ JSON test failed',
        };
      }
    }

    // Generate overall status
    const allTestsPassed = 
      diagnostics.tests.apiKeyValidation?.success &&
      diagnostics.tests.visionAPI?.success &&
      (diagnostics.tests.jsonFormatTest?.success !== false);

    let status = 'unknown';
    if (!OPENAI_API_KEY) {
      status = 'not_configured';
    } else if (allTestsPassed) {
      status = 'healthy';
    } else if (diagnostics.tests.apiKeyValidation?.success) {
      status = 'degraded';
    } else {
      status = 'error';
    }

    // Add general recommendations
    if (status === 'healthy') {
      recommendations.push('✅ OpenAI API is fully functional');
      recommendations.push('💡 You can now use OpenAI for label scanning');
      recommendations.push('🔄 Switch between Gemini and OpenAI in Scanner settings');
    } else if (status === 'not_configured') {
      recommendations.push('📋 Setup Steps:');
      recommendations.push('1. Go to: https://platform.openai.com/api-keys');
      recommendations.push('2. Create new API key (starts with "sk-")');
      recommendations.push('3. Add to Supabase: Edge Functions → Environment Variables');
      recommendations.push('4. Set variable name: OPENAI_API_KEY');
      recommendations.push('5. Restart edge functions');
      recommendations.push('6. Run diagnostics again');
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Diagnostics completed in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        diagnostics,
        recommendations,
        elapsed: `${elapsed}ms`,
        status,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Diagnostics error after ${elapsed}ms:`, error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        elapsed: `${elapsed}ms`,
        status: 'error',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
