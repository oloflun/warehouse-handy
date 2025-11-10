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
