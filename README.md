## Recent Fixes & Summaries

A chronological history of important fixes and improvements to the warehouse-handy system:

- **[Gemini Scanner Error Handling & Stability](./FIX_SUMMARY_GEMINI_SCANNER.md)** - Fixed edge function error codes (200→400/500/502) and documented scanning best practices
- **[FDT Sync Fix](./FDT_SYNC_FIX_SUMMARY.md)** - Resolved inventory synchronization issues with FDT Sellus API
- **[Edge Function Fix](./EDGE_FUNCTION_FIX_SUMMARY.md)** - General edge function error handling improvements
- **[Delivery Note Scanning](./FIX_SUMMARY_DELIVERY_NOTE_SCANNING.md)** - Delivery note scanning feature implementation and fixes
- **[API Authorization](./API_AUTHORIZATION_FIX.md)** - FDT API authentication method fixes
- **[Migration Fix](./MIGRATION_FIX_SUMMARY.md)** - Database migration and schema fixes

---

## Deployment Configuration

This project is configured to deploy automatically to Vercel only when changes are pushed or merged to the `main` branch.

The deployment configuration is specified in `vercel.json`:
- **Automatic deployments**: Enabled only for the `main` branch
- **Feature branches**: Will not trigger production deployments
- **Framework**: Vite
- **Build command**: `npm run build`
- **Output directory**: `dist`

This helps prevent unnecessary preview deployments and conserves resources for feature branches.

## FDT Sellus API Configuration

### Critical Configuration Requirements

When configuring the FDT Sellus API integration in Supabase Edge Functions environment variables, ensure:

#### 1. Base URL Must Include `https://` Protocol ⚠️

**INCORRECT** (will break all API calls):
```
FDT_SELLUS_BASE_URL=stagesellus.fdt.se/12345/api
```

**CORRECT**:
```
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/12345/api
```

The `https://` prefix is **absolutely critical**. Without it, all API functions will fail.

#### 2. API Key Format - Bearer Token

The `FDT_SELLUS_API_KEY` should contain **only the raw API key value**, not the full Bearer header:

**INCORRECT**:
```
FDT_SELLUS_API_KEY=Bearer your-api-key-here
```

**CORRECT**:
```
FDT_SELLUS_API_KEY=your-api-key-here
```

The system automatically adds the `Bearer` prefix when making API calls.

#### 3. Required Environment Variables

Configure these in **Supabase Dashboard → Settings → Edge Functions → Environment Variables**:

```bash
FDT_SELLUS_BASE_URL=https://stagesellus.fdt.se/[YOUR_TENANT_ID]/api
FDT_SELLUS_API_KEY=[your-api-key-value]
FDT_SELLUS_BRANCH_ID=5  # Optional, defaults to 5
```

### FDT Sellus API Methods

**Important**: The FDT Sellus API uses **POST** requests for updating/modifying data (orders, articles, inventory), not PUT/PATCH.

- **POST** - Update or modify existing resources (orders, articles, stock levels)
- **GET** - Retrieve data
- **PUT** - Update system settings and configuration values
- **DELETE** - Remove resources

Always refer to the FDT Sellus API Swagger documentation for the correct HTTP method for each endpoint.

## Gemini API Configuration & Troubleshooting

### 429 "Too Many Requests" Errors
If you encounter `429` errors when scanning labels or delivery notes, it means the Google Gemini API rate limit has been exceeded.

**Solution:**
1.  **Model Selection**: We have switched to `gemini-2.0-flash` which offers better stability and higher rate limits than the experimental versions.
2.  **Wait & Retry**: The application now handles these errors gracefully. If you see this error, wait a minute and try again.
3.  **Check Quota**: Ensure your Google Cloud project has billing enabled or sufficient quota for the Gemini API.

### Localhost Development
If you cannot log in on `localhost`:
-   Ensure your `.env` file has the correct `VITE_SUPABASE_PROJECT_ID` (`sublzjeyxfaxiekacfme`).
-   Verify that `VITE_SUPABASE_PUBLISHABLE_KEY` matches the **Anon Key** from the Supabase dashboard.
