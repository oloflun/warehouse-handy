# Quick Diagnostic Commands for Browser Console

## Run These Commands in Browser Console

Open browser console (F12 → Console tab) on https://logic-wms.vercel.app and run these commands:

### 1. Test Gemini API Configuration

```javascript
// Test comprehensive diagnostics
const diagnosticResult = await supabase.functions.invoke('diagnose-gemini');
console.log('=== GEMINI DIAGNOSTICS ===');
console.log(JSON.stringify(diagnosticResult.data, null, 2));

// Quick check
if (diagnosticResult.data?.diagnostics?.tests?.apiKeyValidation?.success) {
  console.log('✅ API key is valid');
} else {
  console.error('❌ API key problem:', diagnosticResult.data?.diagnostics?.tests?.apiKeyValidation?.message);
}

if (diagnosticResult.data?.diagnostics?.tests?.visionAPI?.success) {
  console.log('✅ Vision API working');
} else {
  console.error('❌ Vision API problem:', diagnosticResult.data?.diagnostics?.tests?.visionAPI?.error);
}
```

### 2. Test Label Scanning with Test Image

```javascript
// Create a simple test image (1x1 red pixel)
const testImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

const labelResult = await supabase.functions.invoke('analyze-label', {
  body: { image: testImage }
});

console.log('=== LABEL SCAN TEST ===');
console.log(JSON.stringify(labelResult.data, null, 2));
```

### 3. Check What User Sees When Scanning

```javascript
// Log what the scanner actually receives
console.log('Testing scanner flow...');

// Simulate what happens in actual scanning
const testCanvas = document.createElement('canvas');
testCanvas.width = 640;
testCanvas.height = 480;
const ctx = testCanvas.getContext('2d');
ctx.fillStyle = '#ff0000';
ctx.fillRect(0, 0, 640, 480);
ctx.fillStyle = '#000000';
ctx.font = '48px Arial';
ctx.fillText('TEST 123456', 100, 240);

const imageData = testCanvas.toDataURL('image/jpeg', 0.85);
console.log('Image data length:', imageData.length);
console.log('Image data prefix:', imageData.substring(0, 50));

const scanResult = await supabase.functions.invoke('analyze-label', {
  body: { image: imageData }
});

console.log('=== ACTUAL SCAN RESULT ===');
console.log('Success:', !scanResult.error);
console.log('Error:', scanResult.error);
console.log('Data:', scanResult.data);
console.log('Article numbers found:', scanResult.data?.article_numbers?.length || 0);
console.log('Product names found:', scanResult.data?.product_names?.length || 0);
```

### 4. Get Actual Supabase Logs (if you have access)

```javascript
// This requires admin access to Supabase
// Go to: Supabase Dashboard → Edge Functions → analyze-label → Logs
// Or use the Supabase CLI:
// supabase functions logs analyze-label --limit 50
```

### 5. Test Delivery Note Scanning

```javascript
// Use the same test image
const deliveryNoteResult = await supabase.functions.invoke('analyze-delivery-note', {
  body: { imageData: testImage }  // Note: parameter name is 'imageData' for delivery notes
});

console.log('=== DELIVERY NOTE SCAN TEST ===');
console.log(JSON.stringify(deliveryNoteResult.data, null, 2));
console.log('Items found:', deliveryNoteResult.data?.items?.length || 0);
```

## Expected Results

### If Everything Works ✅
```javascript
{
  "article_numbers": ["123456"],
  "product_names": ["TEST"],
  "confidence": "high",
  "warnings": []
}
```

### If API Key Missing ❌
```javascript
{
  "error": "GOOGLE_AI_API_KEY not configured",
  "article_numbers": [],
  "product_names": [],
  "confidence": "low"
}
```

### If Safety Filter Blocks ⚠️
```javascript
{
  "error": "Gemini API blocked or failed: SAFETY",
  "details": "Response blocked by safety filters...",
  "article_numbers": [],
  ...
  "rawResponse": { ... }
}
```

### If Model Not Available ❌
```javascript
{
  "error": "Gemini API error: 404",
  "details": "... model not found ...",
  ...
}
```

### If JSON Parse Fails ⚠️
```javascript
{
  "error": "Failed to parse response as JSON",
  "details": "Some non-JSON text from Gemini",
  ...
}
```

## Share These Results

**Copy and paste the console output to help debug:**

1. Full diagnostic result from Test #1
2. Label scan result from Test #3
3. Any error messages
4. Values of:
   - `imageData.length`
   - `imageData.substring(0, 50)`
5. Screenshot of console output

Results:
[Supabase] Using SUPABASE_URL host: sublzjeyxfaxiekacfme.supabase.co index-DMH8sMhu.js:358:86
Request for font "Liberation Mono" blocked at visibility level 2 (requires 3)
logic-wms.vercel.app
Uncaught (in promise) ReferenceError: supabase is not defined
    <anonymous> debugger eval code:3
    <anonymous> debugger eval code:6
debugger eval code:3:3
Cross-Origin begäran blockerad: Samma ursprungspolicy tillåter inte läsning av fjärrresursen på https://sublzjeyxfaxiekacfme.supabase.co/rest/v1/sellus_sync_failures?select=*&resolved_at=is.null&order=created_at.desc. (Orsak: CORS-begäran lyckades inte). Statuskod: (null).

Request for font "Noto Sans" blocked at visibility level 2 (requires 3)
index-DMH8sMhu.js:291:1633
Uncaught (in promise) ReferenceError: supabase is not defined
    <anonymous> debugger eval code:5
    <anonymous> debugger eval code:12
debugger eval code:5:3
// Test comprehensive diagnostics
const diagnosticResult = await supabase.functions.invoke('diagnose-gemini');
console.log('=== GEMINI DIAGNOSTICS ===');
console.log(JSON.stringify(diagnosticResult.data, null, 2));

// Quick check
if (diagnosticResult.data?.diagnostics?.tests?.apiKeyValidation?.success) {
  console.log('✅ API key is valid');
} else {
  console.error('❌ API key problem:', diagnosticResult.data?.diagnostics?.tests?.apiKeyValidation?.message);
}

if (diagnosticResult.data?.diagnostics?.tests?.visionAPI?.success) {
  console.log('✅ Vision API working');
} else {
  console.error('❌ Vision API problem:', diagnosticResult.data?.diagnostics?.tests?.visionAPI?.error);
}
Uncaught SyntaxError: redeclaration of let diagnosticResult
    <anonymous> debugger eval code:1
debugger eval code:1:1
    <anonym> debugger eval code:1

​

[Supabase] Using SUPABASE_URL host: sublzjeyxfaxiekacfme.supabase.co index-DMH8sMhu.js:358:86
Request for font "Liberation Mono" blocked at visibility level 2 (requires 3)
logic-wms.vercel.app
Request for font "Noto Sans" blocked at visibility level 2 (requires 3)
index-DMH8sMhu.js:291:1633
console.log('Testing scanner flow...');

// Simulate what happens in actual scanning
const testCanvas = document.createElement('canvas');
testCanvas.width = 640;
testCanvas.height = 480;
const ctx = testCanvas.getContext('2d');
ctx.fillStyle = '#ff0000';
ctx.fillRect(0, 0, 640, 480);
ctx.fillStyle = '#000000';
ctx.font = '48px Arial';
ctx.fillText('TEST 123456', 100, 240);

const imageData = testCanvas.toDataURL('image/jpeg', 0.85);
console.log('Image data length:', imageData.length);
console.log('Image data prefix:', imageData.substring(0, 50));

const scanResult = await supabase.functions.invoke('analyze-label', {
  body: { image: imageData }
});

console.log('=== ACTUAL SCAN RESULT ===');
console.log('Success:', !scanResult.error);
console.log('Error:', scanResult.error);
console.log('Data:', scanResult.data);
console.log('Article numbers found:', scanResult.data?.article_numbers?.length || 0);
console.log('Product names found:', scanResult.data?.product_names?.length || 0);
Testing scanner flow... debugger eval code:6:11
Image data length: 13035 debugger eval code:19:11
Image data prefix: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD debugger eval code:20:11
Uncaught (in promise) ReferenceError: supabase is not defined
    <anonymous> debugger eval code:21
    <anonymous> debugger eval code:32
debugger eval code:21:3
    <anonym> debugger eval code:21
    <anonym> debugger eval code:32
    getEvalResult resource://devtools/server/actors/webconsole/eval-with-debugger.js:306
    evalWithDebugger resource://devtools/server/actors/webconsole/eval-with-debugger.js:218
    evaluateJS resource://devtools/server/actors/webconsole.js:895
    evaluateJSAsync resource://devtools/server/actors/webconsole.js:788
    makeInfallible resource://devtools/shared/ThreadSafeDevToolsUtils.js:103

​

[Supabase] Using SUPABASE_URL host: sublzjeyxfaxiekacfme.supabase.co index-DMH8sMhu.js:358:86
Request for font "Liberation Mono" blocked at visibility level 2 (requires 3)
logic-wms.vercel.app
Request for font "Noto Sans" blocked at visibility level 2 (requires 3)
index-DMH8sMhu.js:291:1633
Testing scanner flow... debugger eval code:6:11
Image data length: 13035 debugger eval code:19:11
Image data prefix: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD debugger eval code:20:11
Uncaught (in promise) ReferenceError: supabase is not defined
    <anonymous> debugger eval code:21
    <anonymous> debugger eval code:32
debugger eval code:21:3
Request for font "Liberation Mono" blocked at visibility level 2 (requires 3)
delivery-notes
Starting camera for mode: delivery-note index-DMH8sMhu.js:555:3491
Screen orientation lock not supported or denied index-DMH8sMhu.js:555:3705
Camera stream acquired index-DMH8sMhu.js:555:3958
Video playing index-DMH8sMhu.js:555:4124
const deliveryNoteResult = await supabase.functions.invoke('analyze-delivery-note', {
  body: { imageData: testImage }  // Note: parameter name is 'imageData' for delivery notes
});

console.log('=== DELIVERY NOTE SCAN TEST ===');
console.log(JSON.stringify(deliveryNoteResult.data, null, 2));
console.log('Items found:', deliveryNoteResult.data?.items?.length || 0);
Uncaught (in promise) ReferenceError: supabase is not defined
    <anonymous> debugger eval code:3
    <anonymous> debugger eval code:12
debugger eval code:3:3
    <anonym> debugger eval code:3
    <anonym> debugger eval code:12
    getEvalResult resource://devtools/server/actors/webconsole/eval-with-debugger.js:306
    evalWithDebugger resource://devtools/server/actors/webconsole/eval-with-debugger.js:218
    evaluateJS resource://devtools/server/actors/webconsole.js:895
    evaluateJSAsync resource://devtools/server/actors/webconsole.js:788
    makeInfallible resource://devtools/shared/ThreadSafeDevToolsUtils.js:103

​




Scanner:
[Supabase] Using SUPABASE_URL host: sublzjeyxfaxiekacfme.supabase.co index-DMH8sMhu.js:358:86
Request for font "Liberation Mono" blocked at visibility level 2 (requires 3)
logic-wms.vercel.app
Uncaught (in promise) ReferenceError: supabase is not defined
    <anonymous> debugger eval code:3
    <anonymous> debugger eval code:6
debugger eval code:3:3
Cross-Origin begäran blockerad: Samma ursprungspolicy tillåter inte läsning av fjärrresursen på https://sublzjeyxfaxiekacfme.supabase.co/rest/v1/sellus_sync_failures?select=*&resolved_at=is.null&order=created_at.desc. (Orsak: CORS-begäran lyckades inte). Statuskod: (null).

Request for font "Noto Sans" blocked at visibility level 2 (requires 3)
index-DMH8sMhu.js:291:1633
// Create a simple test image (1x1 red pixel)
const testImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

const labelResult = await supabase.functions.invoke('analyze-label', {
  body: { image: testImage }…
Uncaught (in promise) ReferenceError: supabase is not defined
    <anonymous> debugger eval code:5
    <anonymous> debugger eval code:12
debugger eval code:5:3
    <anonym> debugger eval code:5
    <anonym> debugger eval code:12
    getEvalResult resource://devtools/server/actors/webconsole/eval-with-debugger.js:306
    evalWithDebugger resource://devtools/server/actors/webconsole/eval-with-debugger.js:218
    evaluateJS resource://devtools/server/actors/webconsole.js:895
    evaluateJSAsync resource://devtools/server/actors/webconsole.js:788
    makeInfallible resource://devtools/shared/ThreadSafeDevToolsUtils.js:103

## Alternative: Use UI Diagnostics Page

Navigate to: `https://logic-wms.vercel.app/gemini-diagnostics`

This provides a user-friendly interface with the same tests.

Supabase Logs:
{
  "event_message": "OPTIONS | 404 | https://sublzjeyxfaxiekacfme.supabase.co/functions/v1/diagnose-gemini",
  "id": "3c2ee867-c71f-4617-802f-3c1605b2643a",
  "metadata": [
    {
      "deployment_id": null,
      "execution_id": null,
      "execution_time_ms": 26,
      "function_id": null,
      "project_ref": "sublzjeyxfaxiekacfme",
      "request": [
        {
          "headers": [
            {
              "accept": "*/*",
              "accept_encoding": "gzip, br",
              "connection": "Keep-Alive",
              "content_length": null,
              "cookie": null,
              "host": "sublzjeyxfaxiekacfme.supabase.co",
              "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
              "x_client_info": null
            }
          ],
          "host": "sublzjeyxfaxiekacfme.supabase.co",
          "method": "OPTIONS",
          "pathname": "/functions/v1/diagnose-gemini",
          "port": null,
          "protocol": "https:",
          "sb": [],
          "search": null,
          "url": "https://sublzjeyxfaxiekacfme.supabase.co/functions/v1/diagnose-gemini"
        }
      ],
      "response": [
        {
          "headers": [
            {
              "content_length": "83",
              "content_type": "application/json",
              "date": "Wed, 12 Nov 2025 21:03:54 GMT",
              "sb_request_id": "019a79e1-d313-7ec9-a574-7878429bc666",
              "server": "cloudflare",
              "vary": "Accept-Encoding",
              "x_envoy_upstream_service_time": null,
              "x_sb_compute_multiplier": null,
              "x_sb_edge_region": "eu-central-1",
              "x_sb_resource_multiplier": null,
              "x_served_by": "supabase-edge-runtime"
            }
          ],
          "status_code": 404
        }
      ],
      "version": null
    }
  ],
  "timestamp": 1762981434157000
}
