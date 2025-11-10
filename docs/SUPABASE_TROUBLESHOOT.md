Supabase Troubleshooting — Network / CORS / Auth Errors

Summary

This doc captures the changes, checks and fixes applied to resolve "NetworkError when attempting to fetch resource" and CORS failures pointing at an unexpected Supabase project host (e.g. qadtpwd...). Use this for future debugging.

Problem observed

- Browser console showed CORS failures (status code null) for requests to https://qadtpwdokdfqtpvwwhsn.supabase.co (old project ID) and "NetworkError when attempting to fetch resource" from supabase-js.
- Iframe sandboxing and missing Allowed web origins in Supabase caused cookies/localStorage/auth failures.
- Opaque errors like "Error fetching inventory: [object Object]" due to generic error handling.

What I changed

1. Code changes
- src/integrations/supabase/client.ts
  - Added robust environment variable fallbacks: VITE_* and SUPABASE_* and process.env fallbacks.
  - Added console.info to log the effective SUPABASE_URL host at runtime.
  - Exported isSupabaseConfigured flag so pages can detect missing config early.

- src/pages/InventoryPage.tsx
  - Added an early isSupabaseConfigured check to show a clear toast if envs are missing.
  - Improved error extraction and toast messages (stringify fallback) to avoid "[object Object]" output.

- supabase/config.toml
  - Updated project_id from "qadtpwdokdfqtpvwwhsn" to "sublzjeyxfaxiekacfme" to match the intended Supabase project.

2. Dev / Environment changes (applied via DevServerControl)
- Set preview environment variables used by the running dev server:
  - VITE_SUPABASE_URL=https://sublzjeyxfaxiekacfme.supabase.co
  - VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
  - SUPABASE_URL=https://sublzjeyxfaxiekacfme.supabase.co
  - SUPABASE_ANON_KEY=<anon-key>
- Restarted the dev server and ran npm install when vite was missing.

Why this fixed it

- The app was pointing to the wrong Supabase project (qadtpwd...). The frontend and the supabase config were mismatched which caused CORS/auth failures.
- Setting the correct SUPABASE_URL + anon key aligned the client with the intended project.
- Adding the project origin to Supabase Allowed web origins and Auth redirect URLs removed the CORS issues.
- Improved error handling made failures visible and actionable.

How to verify

1. Console log
- Expect to see: "[Supabase] Using SUPABASE_URL host: sublzjeyxfaxiekacfme"

2. Network tab
- Requests to supabase.co should return normal HTTP status codes (200/204) and not show CORS "status null" errors.

3. App flows
- Inventory page loads data.
- Auth flow (sign in) reaches /auth/v1/token successfully (no CORS block).

Operational checklist (quick recovery)

- If you see CORS errors pointing at qadtpwd...:
  - Confirm SUPABASE_URL and SUPABASE_ANON_KEY in the preview/host environment are set to the intended project.
  - Confirm supabase/config.toml has project_id matching SUPABASE_URL host.
  - In Supabase Dashboard for that project: Settings → API → Allowed web origins and Auth redirect URLs include your preview origin (e.g. https://1dac9bc431b94604a690d01399b37d88-d461f334843942929dbf802b4.fly.dev).

- If the app runs inside a sandboxed iframe and you see cookie/localStorage errors:
  - Remove the sandbox attribute or add allow-same-origin, or
  - Move auth requests to a server/edge function (so the browser embed doesn't need same-origin cookies).

Security notes

- Never commit secret keys to the repository. Use DevServerControl or the hosting environment to set SUPABASE keys (already done here).
- The troubleshooting changes added logging (host SET/NOT_SET). Logs purposely avoid printing secret values.

Revert / History

- You can revert these code changes via the project History tab (UI) or via git by checking out the orbit-haven branch and reverting the specific commits. Changes were committed automatically by the system.

Next recommended steps

- Add a small health-check endpoint or a local debug page that prints the effective SUPABASE_URL host and whether isSupabaseConfigured is true (helpful for future previews).
- Consider moving Supabase-sensitive flows (sign-in) to server-side functions if embedding the app inside third-party iframes is required.

Contact

If this recurs, provide the failing request (Network → Copy → Copy as cURL) and console logs and I will investigate further.
