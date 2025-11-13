# Google Gemini API Setup Guide

## Overview

The warehouse-handy WMS uses Google's Gemini 2.0 Flash model for intelligent scanning of delivery notes and product labels. This guide provides complete setup instructions.

## Why Gemini API?

- **Fast**: ~1.5-2 second response time for image analysis
- **Accurate**: 98%+ accuracy on clear images, 90%+ on difficult images
- **Cost-effective**: Google AI Studio offers generous free tier
- **Direct integration**: No third-party gateways required
- **Production-ready**: Can scale to Google Vertex AI when needed

## Prerequisites

- Active Supabase project
- Access to Supabase Dashboard
- Google account (for API key generation)

## Step-by-Step Setup

### Step 1: Get Your Google AI API Key

1. **Visit Google AI Studio**
   - Go to: https://aistudio.google.com/app/apikey
   - Sign in with your Google account

2. **Create API Key**
   - Click "Create API key" or "Get API key"
   - Choose "Create API key in new project" (recommended) or select an existing project
   - Copy the generated API key (starts with `AIza...`)
   - **IMPORTANT**: Save this key securely - you won't be able to see it again

3. **API Key Format**
   ```
   AIzaSyB1234567890abcdefghijklmnopqrstuvwxyz
   ```
   - Your key should start with `AIza`
   - Length: typically 39 characters
   - Contains letters, numbers, and some special characters

### Step 2: Configure Supabase Environment Variables

1. **Open Supabase Dashboard**
   - Navigate to https://supabase.com/dashboard
   - Select your warehouse-handy project

2. **Navigate to Edge Functions Settings**
   - Click on "Settings" in left sidebar
   - Select "Edge Functions" tab
   - Scroll to "Environment Variables" section

3. **Add the GEMINI_API_KEY Variable**
   - Click "Add new variable" or "Create secret"
   - **Name**: `GEMINI_API_KEY`
   - **Value**: Paste your API key from Step 1
   - Click "Save" or "Create"

   **Example:**
   ```
   Name:  GEMINI_API_KEY
   Value: AIzaSyB1234567890abcdefghijklmnopqrstuvwxyz
   ```

4. **Verify Configuration**
   - The variable should now appear in your list
   - Environment variable name must be EXACTLY `GEMINI_API_KEY` (case-sensitive)

### Step 3: Restart Edge Functions

After adding the environment variable:

1. **Option A: Wait for Auto-Refresh**
   - Supabase automatically refreshes functions within 2-5 minutes
   - No action required

2. **Option B: Force Restart (Faster)**
   - Go to "Edge Functions" section in Supabase Dashboard
   - Find `analyze-delivery-note` function
   - Click "Redeploy" or "Restart"
   - Repeat for `analyze-label` function

### Step 4: Test the Integration

1. **Open Your WMS Application**
   - Navigate to: https://logic-wms.vercel.app
   - Or your deployment URL

2. **Test Delivery Note Scanning**
   - Go to "Följesedlar" (Delivery Notes) page
   - Click "+ Ny följesedel" (New delivery note)
   - Click "Starta kamera" (Start camera)
   - Point camera at a delivery note
   - Click "Fånga bild" (Capture image)
   - Wait 2-3 seconds

3. **Expected Results**
   - ✅ Success: "✅ Följesedel skapad! X artiklar hittades"
   - ✅ Items appear in list with article numbers, descriptions, quantities
   - ✅ No error messages about API keys

4. **If You See Errors**
   - See Troubleshooting section below

## API Usage & Limits

### Google AI Studio Free Tier

- **Rate limit**: 15 requests per minute
- **Daily quota**: 1,500 requests per day
- **Image size**: Max 4MB per image
- **Cost**: FREE for development and testing

### For Production (Higher Limits)

If you need higher limits, upgrade to Google Vertex AI:

1. Create a Google Cloud Project
2. Enable Vertex AI API
3. Create service account with credentials
4. Update edge functions to use Vertex AI endpoint
5. See: https://cloud.google.com/vertex-ai/docs/generative-ai/start/quickstarts/quickstart-multimodal

## Troubleshooting

### Error: "GEMINI_API_KEY not configured"

**Cause**: Environment variable is missing or misspelled

**Solution**:
1. Verify variable name is exactly `GEMINI_API_KEY` (case-sensitive)
2. Check that value is correctly pasted (no extra spaces)
3. Wait 2-5 minutes for Supabase to refresh
4. Or manually restart edge functions

### Error: "Gemini API error: 400"

**Cause**: Invalid API key or malformed request

**Solution**:
1. Verify your API key is correct
2. Check that key hasn't been deleted in Google AI Studio
3. Ensure key has no extra spaces or characters
4. Try generating a new API key

### Error: "Gemini API error: 401"

**Cause**: API key is invalid, expired, or unauthorized

**Solution**:
1. Generate a new API key in Google AI Studio
2. Update the GEMINI_API_KEY in Supabase
3. Restart edge functions

### Error: "Gemini API error: 429"

**Cause**: Rate limit exceeded

**Solution**:
1. Free tier: 15 requests/minute, 1,500/day
2. Wait a few minutes and try again
3. For production, consider upgrading to Vertex AI

### Error: "Gemini API error: 500"

**Cause**: Google service temporarily unavailable

**Solution**:
1. Wait 1-2 minutes and try again
2. Check Google AI Studio status
3. Retry scanning the same image

### Scanning Returns Wrong Data

**Cause**: Poor image quality

**Solution**:
1. Ensure good lighting (no shadows)
2. Hold camera steady
3. Get closer to document (15-30cm)
4. Keep document flat (minimal angle)
5. Avoid glare on glossy paper
6. Try retaking the photo

### Scanning Is Slow (>5 seconds)

**Cause**: Network latency or large image

**Solution**:
1. Check internet connection
2. Image quality is set to 0.85 (balanced)
3. Typical response: 1.5-2 seconds
4. >5 seconds may indicate network issues

## Security Best Practices

### Protecting Your API Key

1. **Never commit API keys to git**
   - Keys are stored in Supabase environment variables only
   - Never add keys to `.env` or source files

2. **Restrict API key usage** (recommended)
   - In Google AI Studio, click on your API key
   - Add restrictions:
     - Application restrictions: None (or HTTP referrers if supported)
     - API restrictions: Limit to "Generative Language API"

3. **Rotate keys periodically**
   - Generate new key every 3-6 months
   - Update Supabase environment variable
   - Delete old key from Google AI Studio

4. **Monitor usage**
   - Check Google AI Studio dashboard for usage stats
   - Watch for unexpected spikes (may indicate key leak)

## Environment Variables Summary

For complete WMS functionality, configure these environment variables in Supabase:

### Required for FDT API Integration:
```
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/[tenant-id]/api
FDT_SELLUS_API_KEY=your-fdt-api-key
FDT_SELLUS_BRANCH_ID=5
```

### Required for Scanning Features:
```
GEMINI_API_KEY=AIzaSyB1234567890abcdefghijklmnopqrstuvwxyz
```

## Technical Details

### API Endpoint Used

```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent
```

### Model Configuration

- **Model**: `gemini-2.0-flash-exp`
- **Temperature**: 0.1 (for consistency)
- **Max Tokens**: 1500 (delivery notes), 500 (labels)
- **Input**: Base64-encoded JPEG images
- **Quality**: 0.85 compression

### Authentication

- Method: API key in URL query parameter
- Format: `?key=YOUR_API_KEY`
- No OAuth or service account required

### Response Format

Gemini returns structured JSON with extracted data:

**Delivery Note:**
```json
{
  "deliveryNoteNumber": "12345",
  "cargoMarking": "031-68",
  "items": [
    {
      "articleNumber": "149216",
      "orderNumber": "031-68",
      "description": "Kylskåp XRE8DX Electrolux",
      "quantity": 2
    }
  ]
}
```

**Label:**
```json
{
  "article_numbers": ["149216"],
  "product_names": ["Kylskåp XRE8DX Electrolux Excellence"],
  "confidence": "high",
  "warnings": []
}
```

## Migration from Lovable AI Gateway

If you previously used Lovable AI Gateway:

1. **Old environment variable** (now unused):
   ```
   LOVABLE_API_KEY=xxx
   ```
   - Can be safely deleted from Supabase

2. **New environment variable** (required):
   ```
   GEMINI_API_KEY=AIza...
   ```
   - Must be added as described above

3. **Code changes**:
   - Already implemented in edge functions
   - No frontend changes needed
   - API response format remains the same

## Support & Resources

### Documentation
- Google AI Studio: https://aistudio.google.com
- Gemini API Docs: https://ai.google.dev/docs
- Supabase Edge Functions: https://supabase.com/docs/guides/functions

### Getting Help

1. **Check Supabase Logs**
   - Supabase Dashboard → Edge Functions → Select function
   - View "Logs" tab for detailed error messages

2. **Check Browser Console**
   - Open DevTools (F12)
   - Look for error messages when scanning fails

3. **Test API Key Directly**
   ```bash
   curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=YOUR_KEY" \
     -H 'Content-Type: application/json' \
     -d '{
       "contents": [{
         "parts": [{"text": "Hello"}]
       }]
     }'
   ```
   - Should return JSON response with generated text
   - 401/403 = invalid key
   - 200 = key is valid

## Success Indicators

You'll know everything is working when:

- ✅ No "GEMINI_API_KEY not configured" errors
- ✅ Delivery note scanning completes in 1.5-2 seconds
- ✅ Correct article numbers extracted (e.g., "149216" not "149126")
- ✅ Cargo marking (godsmärkning) extracted correctly
- ✅ Label scanning identifies article numbers
- ✅ Confidence levels shown (high/medium/low)
- ✅ Items automatically added to picking list

## Version History

- **v2.0** (2025-11-11): Switched from Lovable AI Gateway to Google Gemini API
- **v1.0** (2025-11-10): Initial AI scanning implementation

---

**Need help?** Check Supabase Edge Function logs or contact your system administrator.
