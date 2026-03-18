// @ts-nocheck
/**
 * Supabase Edge Function: voice-transcribe
 *
 * Purpose:
 * - Receive a Supabase Storage path for an audio file in the 'voice-captures' bucket
 * - Download the audio server-side (using service role key — never exposed to client)
 * - Send to ElevenLabs Scribe for transcription (best multilingual accuracy)
 * - Return { transcript, language_detected } to the Expo app
 *
 * Auth, CORS, and error patterns copied exactly from note-style/index.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type RequestBody = {
  audio_storage_path: string // path inside the 'voice-captures' bucket
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
    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY')

    if (!elevenLabsApiKey) {
      return json({ error: 'Missing ELEVENLABS_API_KEY secret in Supabase' }, 500)
    }

    // 4) Verify the user is authenticated
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
    const audioPath = (body.audio_storage_path ?? '').toString().trim()

    if (!audioPath) {
      return json({ error: 'audio_storage_path is required' }, 400)
    }

    // 6) Download the audio file from Supabase Storage using the service role key.
    //    We use service role here because the bucket is private. The service role key
    //    must NEVER be sent to the client — it stays server-side in this Edge Function.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: fileData, error: downloadErr } = await adminClient.storage
      .from('voice-captures')
      .download(audioPath)

    if (downloadErr || !fileData) {
      return json({ error: 'Transcription failed', detail: 'Could not download audio file' }, 422)
    }

    // 7) Send the audio to ElevenLabs Scribe for transcription.
    //    ElevenLabs Scribe is chosen for its best-in-class multilingual accuracy
    //    (99 languages, outperforms Whisper and Deepgram on non-English input).
    const formData = new FormData()
    formData.append('file', fileData, audioPath.split('/').pop() ?? 'audio.webm')
    formData.append('model_id', 'scribe_v1')

    const elevenResp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
      },
      body: formData,
    })

    if (!elevenResp.ok) {
      const errText = await elevenResp.text()
      console.error('ElevenLabs error:', errText)
      return json({ error: 'Transcription failed' }, 422)
    }

    const elevenJson = await elevenResp.json()

    const transcript = (elevenJson.text ?? '').trim()
    const language_detected = elevenJson.language_code ?? elevenJson.detected_language ?? 'unknown'

    if (!transcript) {
      return json({ error: 'Transcription failed' }, 422)
    }

    return json({ transcript, language_detected })
  } catch (e) {
    console.error('voice-transcribe unexpected error:', e)
    return json({ error: 'Transcription failed' }, 422)
  }
})
