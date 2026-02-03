// @ts-nocheck
/**
 * Supabase Edge Function: note-style
 *
 * Purpose:
 * - Receive messy/raw notes + a persona (Executive/Social/etc.)
 * - Call OpenAI (server-side) to transform notes into professional Markdown
 * - Return { formatted_content } to the Expo app
 *
 * Why Edge Function (important beginner concept):
 * - We MUST NOT put the OpenAI API key inside the mobile/web app.
 * - Edge Functions run on Supabase servers and can safely use secrets.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type PersonaId = 'Executive' | 'Social' | 'Summarize' | 'Academic'

type RequestBody = {
  title?: string
  raw_content: string
  persona: PersonaId
}

/**
 * Persona system prompts (server-side).
 * These are the “hidden instructions” you asked for.
 *
 * Beginner note:
 * - The *system prompt* is the “rules of the assistant”.
 * - The *user content* is the note text.
 */
const PERSONA_SYSTEM_PROMPTS: Record<PersonaId, string> = {
  Executive: [
    'You are Note-Styler AI.',
    'Transform the user’s raw notes into a concise, professional executive memo in Markdown.',
    'Use clear headings, bullet points, and action items.',
    'No emojis.',
    'Output Markdown only.',
  ].join('\n'),
  Social: [
    'You are Note-Styler AI.',
    'Transform the user’s raw notes into a social-media friendly post in Markdown.',
    'Use short lines, bullet points, and include a few relevant emojis.',
    'Keep it engaging and easy to skim.',
    'Output Markdown only.',
  ].join('\n'),
  Summarize: [
    'You are Note-Styler AI.',
    'Summarize the user’s raw notes into a structured Markdown summary.',
    'Include: Key points, Decisions, Next steps.',
    'No emojis.',
    'Output Markdown only.',
  ].join('\n'),
  Academic: [
    'You are Note-Styler AI.',
    'Transform the user’s raw notes into an academic-style outline in Markdown.',
    'Use headings, numbered lists, and precise wording.',
    'No emojis.',
    'Output Markdown only.',
  ].join('\n'),
}

/**
 * Helper: JSON response with CORS.
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // 1) CORS preflight (browser sends OPTIONS first)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 2) Only allow POST
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    // 3) Read secrets from Supabase environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiApiKey) {
      return json({ error: 'Missing OPENAI_API_KEY secret in Supabase' }, 500)
    }

    // 4) Verify the user is authenticated (very important)
    //
    // The Expo app calls:
    //   supabase.functions.invoke('note-style', ...)
    // Supabase-js automatically attaches the user’s access token in the Authorization header.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header (user not logged in?)' }, 401)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return json({ error: 'Invalid user session' }, 401)
    }

    // 5) Parse and validate request body
    const body = (await req.json()) as Partial<RequestBody>
    const raw = (body.raw_content ?? '').toString()
    const persona = body.persona as PersonaId
    const title = (body.title ?? '').toString()

    if (!raw.trim()) {
      return json({ error: 'raw_content is required' }, 400)
    }

    if (!persona || !(persona in PERSONA_SYSTEM_PROMPTS)) {
      return json({ error: 'persona is required and must be a valid PersonaId' }, 400)
    }

    // Safety limit (prevents huge prompts and cost explosions)
    const MAX_CHARS = 12000
    const clippedRaw = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) : raw

    // 6) Call OpenAI (Chat Completions)
    //
    // Beginner note:
    // - We send the “system prompt” + the user content.
    // - The model returns formatted Markdown.
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        messages: [
          { role: 'system', content: PERSONA_SYSTEM_PROMPTS[persona] },
          {
            role: 'user',
            content: [
              title ? `Title: ${title}` : '',
              'Raw notes:',
              clippedRaw,
              '',
              'Return Markdown only.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      }),
    })

    if (!openaiResp.ok) {
      const txt = await openaiResp.text()
      return json({ error: 'OpenAI request failed', details: txt }, 502)
    }

    const openaiJson = await openaiResp.json()
    const formatted = openaiJson?.choices?.[0]?.message?.content?.toString?.() ?? ''

    if (!formatted.trim()) {
      return json({ error: 'OpenAI returned empty output' }, 502)
    }

    return json({ formatted_content: formatted })
  } catch (e) {
    return json({ error: 'Unexpected error', details: String(e) }, 500)
  }
})

