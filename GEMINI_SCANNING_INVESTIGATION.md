# Gemini API Scanning Failure Investigation

**Date**: 2025-11-12  
**Issue**: #55 - Complete scanning failure after PR #53  
**Investigation Time**: 1+ hour comprehensive analysis

## Problem Statement

User reports **COMPLETE FAILURE** of all scanning features on Nov 12, 2025:
1. Delivery note scanning returns NO items (empty arrays)
2. Label/article scanning finds NO article numbers
3. Both features return "Kunde inte läsa följjesedeln" and "Ingen artikel hittad"
4. Empty delivery notes are created with 0/0 articles

User confirms: **GOOGLE_AI_API_KEY IS configured in Supabase**

## Historical Context

### Previous Attempts (All Failed)
- **PR #49**: Implemented Lovable AI Gateway (wrong choice)
- **PR #50**: Replaced Lovable with Google Gemini API (correct choice but still failing)
- **PR #51**: Added proper HTTP status codes 400/500/502 (**BROKE EVERYTHING**)
- **PR #53**: **Fixed** status codes back to 200-only (per project standards)

### Key Finding
PR #53 fixed the "non-2xx status code" error, BUT the underlying OCR problem persists. Edge functions now return 200 OK properly, but with **EMPTY RESULTS** (no items extracted).

## Root Cause Investigation

### Hypothesis 1: API Key Configuration ❌ RULED OUT
User confirmed GOOGLE_AI_API_KEY is configured in Supabase.

### Hypothesis 2: Gemini API Response Issues ⚠️ **INVESTIGATING**

Possible causes identified:

#### A. Model Availability Issue
```typescript
// Current model used:
gemini-2.0-flash-exp  // Experimental - may have availability issues
```

**Status**: `gemini-2.0-flash-exp` is experimental and may:
- Not be available in all regions
- Have changed behavior
- Be deprecated or rate-limited

**Potential Solutions**:
1. Try `gemini-1.5-flash` (stable model)
2. Try `gemini-1.5-pro` (more capable but slower)

#### B. Safety Filter Blocking
Gemini may block responses due to safety filters on delivery note/label images.

**Evidence to check**:
```typescript
const finishReason = data.candidates?.[0]?.finishReason;
// SAFETY = blocked by safety filters
// MAX_TOKENS = response too long
// STOP = normal completion
```

#### C. Response Format Changes
Gemini may return:
- Empty `candidates` array
- `null` content
- Non-JSON formatted text despite prompts
- Markdown-wrapped JSON that parsing fails on

#### D. Image Data Issues
- Base64 encoding corruption
- Image too large/small
- Wrong MIME type
- Missing data URL prefix handling

### Current Code Flow

```typescript
// Frontend captures image
const imageData = canvas.toDataURL('image/jpeg', 0.85);

// Sent to edge function
body: { image: imageData }  // or imageData for delivery notes

// Edge function processes
data: image.split(',')[1]  // Removes data:image/jpeg;base64, prefix

// Sent to Gemini
inline_data: {
  mime_type: 'image/jpeg',
  data: base64String
}
```

**Potential issue**: If `imageData` doesn't contain the comma-separated prefix, `split(',')[1]` returns `undefined`.

## Enhanced Diagnostics Added

### 1. New Edge Function: `diagnose-gemini`
Comprehensive diagnostic tool that tests:
- API key validation (text-only test)
- Vision API with test image
- JSON response format parsing
- Detailed error messages with actionable steps

**Access**:
- UI: Navigate to `/gemini-diagnostics`
- Console: `await supabase.functions.invoke('diagnose-gemini')`

### 2. Enhanced Logging in Edge Functions
Added to both `analyze-label` and `analyze-delivery-note`:

```typescript
// Log raw API response
console.log('Raw Gemini API response:', JSON.stringify(data, null, 2));

// Check finish reason
const finishReason = data.candidates?.[0]?.finishReason;
if (finishReason !== 'STOP') {
  // Return detailed error about why Gemini stopped
}

// Log parsing attempts
console.log('Attempting to parse cleaned content:', cleanContent);
console.log('Parse error:', parseError);
```

### 3. UI Diagnostics Page
Created `/gemini-diagnostics` page that:
- Auto-runs diagnostics on page load
- Shows API key configuration status
- Tests actual Gemini Vision API
- Displays detailed error messages
- Provides step-by-step fix instructions
- Shows real API responses

## Testing Instructions for User

### Step 1: Run Diagnostics UI
1. Navigate to: `https://logic-wms.vercel.app/gemini-diagnostics`
2. Wait for auto-diagnostic to complete
3. Check status indicators:
   - ✅ Green = Working
   - ❌ Red = Failed
   - ⚠️ Yellow = Warning

### Step 2: Check Edge Function Logs
1. Go to: Supabase Dashboard → Edge Functions → Logs
2. Try scanning a delivery note or label
3. Look for these log entries:
   ```
   Raw Gemini API response: {...}
   Gemini text response: ...
   Attempting to parse cleaned content: ...
   ```
4. Copy and share any errors found

### Step 3: Test with Browser Console
```javascript
// Test diagnosis
const result = await supabase.functions.invoke('diagnose-gemini');
console.log(JSON.stringify(result.data, null, 2));

// Test actual label scanning
const testImage = 'data:image/jpeg;base64,...';  // Your test image
const scanResult = await supabase.functions.invoke('analyze-label', {
  body: { image: testImage }
});
console.log('Scan result:', scanResult.data);
```

## Recommended Actions

### If Diagnostics Show API Working ✅
**Then the issue is with actual scanning implementation**, likely:
1. Image quality/format problem
2. Prompt too complex/aggressive
3. Swedish text recognition issues
4. Model not suitable for this use case

**Next steps**:
- Try different Gemini model (`gemini-1.5-flash`)
- Simplify prompts
- Test with multiple image samples
- Add image preprocessing

### If Diagnostics Show API Failure ❌
**Follow the error message guidance**, usually:
1. API key invalid → Generate new key
2. Rate limit → Wait or upgrade quota
3. Permission denied → Enable Gemini API in Google Cloud Console
4. Model not found → Switch to stable model

## Files Modified

### Edge Functions
1. **`supabase/functions/diagnose-gemini/index.ts`** (NEW)
   - Comprehensive API testing
   - Multiple test scenarios
   - Detailed error analysis

2. **`supabase/functions/analyze-label/index.ts`**
   - Added raw response logging
   - Added finish reason checking
   - Added safety filter detection
   - Enhanced error messages

3. **`supabase/functions/analyze-delivery-note/index.ts`**
   - Added raw response logging
   - Added finish reason checking
   - Enhanced error messages

### Frontend
4. **`src/pages/GeminiDiagnostics.tsx`** (NEW)
   - Full diagnostic UI
   - Auto-testing on load
   - Step-by-step setup guide
   - Real-time status display

5. **`src/App.tsx`**
   - Added `/gemini-diagnostics` route

## Success Criteria

- [ ] Diagnostic page shows ✅ for all tests
- [ ] Edge function logs show successful Gemini responses
- [ ] Delivery note scanning extracts items correctly
- [ ] Label scanning finds article numbers
- [ ] No empty arrays returned from scanning functions

## Next Investigation Steps (If Still Failing)

1. **Test Alternative Models**
   ```typescript
   // Try gemini-1.5-flash instead of gemini-2.0-flash-exp
   `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`
   ```

2. **Add Image Preprocessing**
   - Resize images to optimal size (800x600px)
   - Enhance contrast
   - Convert to grayscale for better OCR

3. **Simplify Prompts**
   - Break down complex multi-step instructions
   - Test with minimal prompts first
   - Add examples in prompts

4. **Consider Alternative OCR**
   - Google Vision API (more expensive but more reliable)
   - Tesseract.js (free, client-side, but less accurate)
   - Azure Computer Vision (good Swedish support)

## User Action Required

**CRITICAL**: Please run the diagnostics and share results:

1. Visit `/gemini-diagnostics` page
2. Screenshot the results
3. Check Supabase Edge Function logs for `analyze-label` and `analyze-delivery-note`
4. Try scanning and share the console logs

This will reveal the EXACT cause of the failure.
