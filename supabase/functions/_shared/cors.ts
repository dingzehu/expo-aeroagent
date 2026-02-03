/**
 * CORS helpers for Supabase Edge Functions.
 *
 * Why this exists:
 * - If you call your Edge Function from the browser (Expo web),
 *   the browser enforces CORS (Cross-Origin Resource Sharing).
 * - Without these headers, your requests may be blocked.
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

