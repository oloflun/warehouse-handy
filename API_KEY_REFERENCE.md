# API Key Reference Guide

**Quick reference for API key configuration in warehouse-handy**

---

## Environment Variable Names

### Gemini API (Google)
```bash
Variable Name: GEMINI_API_KEY
Key Format: AIza...
Key Length: ~39 characters
Example: AIzaSyAbc123def456ghi789jkl012mno345
```

**Get Key:**
- Visit: https://ai.google.dev/
- Click: "Get API Key"
- Enable: Gemini API in your project

### OpenAI API
```bash
Variable Name: OPENAI_API_KEY
Key Format: sk-...
Key Length: ~48+ characters  
Example: sk-proj-abc123xyz789def456ghi012jkl345mno678pqr901
```

**Get Key:**
- Visit: https://platform.openai.com/api-keys
- Click: "Create new secret key"
- Copy: Full key including "sk-" prefix

---

## Where to Configure

### Supabase Dashboard

**Location:**
```
Supabase Dashboard
  → Project Settings (or Edge Functions)
  → Environment Variables
  → Add Variable
```

**Required Variables:**
```bash
# Required - For Gemini scanning
GEMINI_API_KEY=AIza...

# Optional - For OpenAI scanning (dual-provider support)
OPENAI_API_KEY=sk-...

# Note: Other variables (FDT_SELLUS_*) already configured
```

---

## How to Verify Setup

### Option 1: Diagnostics Pages

**Gemini:**
```
Navigate to: /gemini-diagnostics
Should show:
  ✅ GEMINI_API_KEY: Configured (AIza...)
  ✅ API key validation: Success
  ✅ Vision API: Working
```

**OpenAI:**
```
Navigate to: /openai-diagnostics
Should show:
  ✅ OPENAI_API_KEY: Configured (sk-...)
  ✅ API key validation: Success
  ✅ Vision API: Working
```

### Option 2: Scanner Page

```
Navigate to: /scanner
In Model Selector:
  - If GEMINI_API_KEY configured: Gemini option available
  - If OPENAI_API_KEY configured: OpenAI option available
  - Both configured: Can switch between them
```

---

## Code References

### Where Keys Are Used

**Gemini:**
```typescript
// File: supabase/functions/analyze-label/index.ts
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

// File: supabase/functions/analyze-delivery-note/index.ts  
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

// File: supabase/functions/diagnose-gemini/index.ts
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
```

**OpenAI:**
```typescript
// File: supabase/functions/analyze-label-openai/index.ts
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// File: supabase/functions/diagnose-openai/index.ts
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
```

### Frontend (Does NOT access keys)

```typescript
// File: src/pages/Scanner.tsx
// Frontend only selects which provider to use
const [aiProvider, setAiProvider] = useState<"gemini" | "openai">("gemini");

// Calls edge function (key used server-side)
const { data, error } = await supabase.functions.invoke(
  aiProvider === "openai" ? "analyze-label-openai" : "analyze-label",
  { body: { image: imageBase64 } }
);
```

---

## Troubleshooting

### "GEMINI_API_KEY not configured"

**Problem:** Edge function can't find the environment variable

**Solution:**
```bash
1. Check variable name is exactly: GEMINI_API_KEY (case-sensitive)
2. Verify key is in Edge Function environment (not project settings)
3. Restart edge functions after adding variable
4. Run diagnostics: /gemini-diagnostics
```

### "OPENAI_API_KEY not configured"

**Problem:** Edge function can't find the environment variable

**Solution:**
```bash
1. Check variable name is exactly: OPENAI_API_KEY (case-sensitive)
2. Verify key starts with "sk-"
3. Ensure key is in Edge Function environment variables
4. Restart edge functions after adding variable
5. Run diagnostics: /openai-diagnostics
```

### "Rate limit exceeded"

**Problem:** Too many API calls

**Gemini:**
```bash
Free tier limits:
- 15 requests per minute
- 1,500 requests per day

Solution:
- Wait for rate limit reset
- Upgrade to paid tier
- Switch to OpenAI temporarily
```

**OpenAI:**
```bash
Rate limits vary by usage tier:
- Tier 1 (New): 500 RPM
- Tier 2: 5,000 RPM
- Tier 3+: Higher limits

Solution:
- Wait for rate limit reset
- Check usage: https://platform.openai.com/usage
- Upgrade tier if needed
- Switch to Gemini temporarily
```

### Key format errors

**Gemini:**
```bash
❌ Wrong: GEMINI_API_KEY=AIza... (with prefix in docs)
✅ Right: GEMINI_API_KEY=AIzaSyAbc123def456...

Format: Must start with "AIza"
Length: Typically 39 characters
```

**OpenAI:**
```bash
❌ Wrong: OPENAI_API_KEY=Bearer sk-...
❌ Wrong: OPENAI_API_KEY="sk-..."
✅ Right: OPENAI_API_KEY=sk-proj-abc123xyz789...

Format: Must start with "sk-"
Length: 48+ characters
No quotes, no "Bearer" prefix
```

---

## Quick Setup Checklist

### Initial Setup

- [ ] Get Gemini API key from https://ai.google.dev/
- [ ] Get OpenAI API key from https://platform.openai.com/api-keys (optional)
- [ ] Open Supabase Dashboard
- [ ] Navigate to Edge Functions → Environment Variables
- [ ] Add GEMINI_API_KEY with your Gemini key
- [ ] Add OPENAI_API_KEY with your OpenAI key (if using)
- [ ] Save variables
- [ ] Restart edge functions (if needed)
- [ ] Test via diagnostics pages

### Verification

- [ ] Navigate to /gemini-diagnostics
- [ ] Verify all tests show ✅ green
- [ ] Navigate to /openai-diagnostics (if configured)
- [ ] Verify all tests show ✅ green
- [ ] Open /scanner page
- [ ] Verify model selector shows available providers
- [ ] Test scanning with each provider

---

## Security Best Practices

### ✅ DO:
- Store keys in Supabase environment variables
- Use different keys for dev/staging/production
- Rotate keys periodically (every 90 days)
- Monitor usage dashboards
- Set up billing alerts

### ❌ DON'T:
- Hardcode keys in source code
- Commit keys to git
- Share keys via email/chat
- Use same key across environments
- Log keys in console/errors

---

## Cost Monitoring

### Gemini API
```
Free Tier:
- 15 requests/minute
- 1,500 requests/day
- $0 cost

Monitor at: https://ai.google.dev/
Usage page: Check quota in dashboard
```

### OpenAI API
```
Pricing (as of 2024):
- gpt-4o-mini: $0.15/1M input tokens, $0.60/1M output
- gpt-4o: $5/1M input tokens, $15/1M output
- gpt-4-vision: Similar to gpt-4o

Monitor at: https://platform.openai.com/usage
Set alerts: Billing → Usage limits
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│ API Key Quick Reference                         │
├─────────────────────────────────────────────────┤
│                                                 │
│ Gemini (Google):                                │
│   Variable: GEMINI_API_KEY                      │
│   Format: AIza... (39 chars)                    │
│   Get: https://ai.google.dev/                   │
│   Test: /gemini-diagnostics                     │
│                                                 │
│ OpenAI:                                         │
│   Variable: OPENAI_API_KEY                      │
│   Format: sk-... (48+ chars)                    │
│   Get: https://platform.openai.com/api-keys     │
│   Test: /openai-diagnostics                     │
│                                                 │
│ Configure:                                      │
│   Supabase → Edge Functions → Env Variables     │
│                                                 │
│ Verify:                                         │
│   Admin Tools → Run Diagnostics                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

**Last Updated:** 2025-11-13  
**System:** warehouse-handy  
**Version:** 1.0
