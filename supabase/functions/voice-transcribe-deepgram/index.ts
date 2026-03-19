// @ts-nocheck
/**
 * Supabase Edge Function: voice-transcribe-deepgram
 *
 * Purpose:
 * - Receive a Supabase Storage path for an audio file in the 'voice-captures' bucket
 * - Download the audio server-side (using service role key — never exposed to client)
 * - Send to Deepgram nova-2 for transcription
 * - Return { transcript, language_detected } to the Expo app
 *
 * Required secret: DEEPGRAM_API_KEY (set via `npx supabase secrets set DEEPGRAM_API_KEY=...`)
 *
 * Auth, CORS, and error patterns match the other edge functions in this project.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type RequestBody = {
  audio_storage_path: string // path inside the 'voice-captures' bucket
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // 1) CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 2) Only allow POST
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    // 3) Read secrets
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY')

    if (!deepgramApiKey) {
      return json({ error: 'Missing DEEPGRAM_API_KEY secret in Supabase' }, 500)
    }

    // 4) Verify the user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return json({ error: 'Invalid user session' }, 401)
    }

    // 5) Parse and validate request body
    const body = (await req.json()) as Partial<RequestBody>
    const audioPath = (body.audio_storage_path ?? '').toString().trim()

    if (!audioPath) {
      return json({ error: 'audio_storage_path is required' }, 400)
    }

    // 6) Download the audio file from Supabase Storage using the service role key.
    //    The bucket is private — service role is the only way to download server-side.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: fileData, error: downloadErr } = await adminClient.storage
      .from('voice-captures')
      .download(audioPath)

    if (downloadErr || !fileData) {
      console.error('[voice-transcribe-deepgram] Storage download error:', downloadErr)
      return json({ error: 'Transcription failed', detail: 'Could not download audio file from storage' }, 422)
    }

    // Guard: detect empty file (e.g. caused by a broken upload)
    if (fileData.size === 0) {
      return json({ error: 'Transcription failed', detail: 'Audio file is empty — upload may have failed' }, 422)
    }

    // 7) Convert blob to ArrayBuffer for the Deepgram request body
    const arrayBuffer = await fileData.arrayBuffer()

    // Derive MIME type from file extension
    const ext = audioPath.split('.').pop()?.toLowerCase() ?? 'm4a'
    const mimeType =
      ext === 'webm' ? 'audio/webm' :
      ext === 'mp4'  ? 'audio/mp4'  :
      ext === 'wav'  ? 'audio/wav'  :
      ext === 'ogg'  ? 'audio/ogg'  :
                       'audio/m4a'

    // 8) Send to Deepgram nova-2 for transcription
    //    nova-2 supports 30+ languages with automatic language detection.
    const deepgramResp = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&detect_language=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${deepgramApiKey}`,
          'Content-Type': mimeType,
        },
        body: arrayBuffer,
      }
    )

    if (!deepgramResp.ok) {
      const errText = await deepgramResp.text()
      console.error(`[voice-transcribe-deepgram] Deepgram HTTP ${deepgramResp.status}:`, errText)
      return json({ error: 'Transcription failed', detail: `Deepgram ${deepgramResp.status}: ${errText}` }, 422)
    }

    const deepgramJson = await deepgramResp.json()

    const transcript = (
      deepgramJson?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
    ).trim()

    const language_detected =
      deepgramJson?.results?.channels?.[0]?.detected_language ?? 'unknown'

    if (!transcript) {
      console.error('[voice-transcribe-deepgram] Empty transcript. Response:', JSON.stringify(deepgramJson))
      return json({ error: 'Transcription failed', detail: 'Deepgram returned an empty transcript' }, 422)
    }

    return json({ transcript, language_detected })
  } catch (e) {
    console.error('[voice-transcribe-deepgram] Unexpected error:', e)
    return json({ error: 'Transcription failed', detail: String(e) }, 422)
  }
})
