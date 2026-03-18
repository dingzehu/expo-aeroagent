// @ts-nocheck
/**
 * Supabase Edge Function: ai-classifier
 *
 * Purpose:
 * - Receive raw text (typed or voice-transcribed)
 * - Call Gemini (server-side) to classify it into task/shopping/journal/unclassified
 * - Return { classification, confidence, extracted } to the Expo app
 *
 * Auth, CORS, retry, and error patterns copied exactly from note-style/index.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type RequestBody = {
  raw_text: string
}

type ClassificationResult = {
  classification: 'task' | 'shopping' | 'journal' | 'unclassified'
  confidence: number
  extracted: {
    title?: string
    due_date_hint?: string
    item_name?: string
    quantity?: string
    content?: string
    mood?: string
  }
}

const CLASSIFIER_SYSTEM_PROMPT = `You are a personal life capture assistant. Your job is to read a short note and classify it into exactly one category, then extract the relevant structured data.

Categories (choose the BEST fit — prefer a specific category over "unclassified"):
- task: something the user needs to do, remember, or get done
- shopping: something the user needs to buy, pick up, or get from a store
- journal: a feeling, thought, reflection, or personal observation
- unclassified: ONLY use this when the input is truly meaningless, random characters, or completely ambiguous even after considering context

Classification tips:
- If it mentions buying, getting, picking up, or any consumable item → shopping
- If it implies an action the user should take → task
- If it expresses a feeling, opinion, or reflection → journal
- Short inputs (1-3 words) are still classifiable. "buy milk" is shopping. "clean room" is a task. "feeling sad" is journal.
- When in doubt between categories, pick the most likely one with lower confidence rather than defaulting to unclassified.

Return ONLY valid JSON matching this schema:
{
  "classification": "task" | "shopping" | "journal" | "unclassified",
  "confidence": number between 0 and 1,
  "extracted": {
    "title": string,         // for task: short action title
    "due_date_hint": string, // for task: if user mentioned a time ('Friday', 'tomorrow')
    "item_name": string,     // for shopping: the item name
    "quantity": string,      // for shopping: quantity if mentioned
    "content": string,       // for journal: the full entry text
    "mood": string           // for journal: single mood word if detectable
  }
}

Examples:
Input: "call dentist tomorrow morning"
Output: { "classification": "task", "confidence": 0.97, "extracted": { "title": "Call dentist", "due_date_hint": "tomorrow morning" } }

Input: "buy milk"
Output: { "classification": "shopping", "confidence": 0.98, "extracted": { "item_name": "milk" } }

Input: "eggs and bread"
Output: { "classification": "shopping", "confidence": 0.90, "extracted": { "item_name": "eggs and bread" } }

Input: "need to buy protein powder"
Output: { "classification": "shopping", "confidence": 0.99, "extracted": { "item_name": "protein powder" } }

Input: "clean the garage"
Output: { "classification": "task", "confidence": 0.95, "extracted": { "title": "Clean the garage" } }

Input: "feeling really exhausted after today"
Output: { "classification": "journal", "confidence": 0.95, "extracted": { "content": "Feeling really exhausted after today", "mood": "exhausted" } }

Input: "had a great day at the park"
Output: { "classification": "journal", "confidence": 0.92, "extracted": { "content": "Had a great day at the park", "mood": "happy" } }`

/**
 * Helper: JSON response with CORS.
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Helper: async sleep (for retry backoff).
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fallback result used when Gemini returns unparseable output.
 * A saved unclassified item is always better than a failed save.
 */
const FALLBACK_RESULT: ClassificationResult = {
  classification: 'unclassified',
  confidence: 0,
  extracted: {},
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
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

    if (!geminiApiKey) {
      return json({ error: 'Missing GEMINI_API_KEY secret in Supabase' }, 500)
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
    const rawText = (body.raw_text ?? '').toString().trim()

    if (!rawText) {
      return json({ error: 'raw_text is required' }, 400)
    }

    // Safety limit
    const MAX_CHARS = 2000
    const clippedText = rawText.length > MAX_CHARS ? rawText.slice(0, MAX_CHARS) : rawText

    // 6) Call Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`
    const geminiBody = {
      systemInstruction: {
        role: 'system',
        parts: [{ text: CLASSIFIER_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: clippedText }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
      },
    }

    // Retry logic: same pattern as note-style/index.ts
    const MAX_RETRIES = 2
    let geminiResp: Response | null = null
    let lastText = ''

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      geminiResp = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      })

      if (geminiResp.ok) break

      lastText = await geminiResp.text()

      if ((geminiResp.status === 429 || geminiResp.status === 503) && attempt < MAX_RETRIES) {
        const retryAfter = Number(geminiResp.headers.get('retry-after') ?? '')
        const backoffMs =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt
        await sleep(Math.min(backoffMs, 4000))
        continue
      }

      break
    }

    // If Gemini failed after retries, return unclassified (never lose user input)
    if (!geminiResp || !geminiResp.ok) {
      console.error(`[ai-classifier] Gemini HTTP ${geminiResp?.status}:`, lastText)
      return json({ ...FALLBACK_RESULT, _debug_error: `Gemini ${geminiResp?.status}: ${lastText}` })
    }

    const geminiJson = await geminiResp.json()
    const rawOutput =
      geminiJson?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''

    // 7) Parse Gemini's JSON response — fall back to unclassified if unparseable
    // Strip markdown code fences that Gemini adds despite being told not to (e.g. ```json ... ```)
    let result: ClassificationResult
    try {
      const cleaned = rawOutput.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
      result = JSON.parse(cleaned) as ClassificationResult

      // Basic validation: ensure classification is a known value
      const valid = ['task', 'shopping', 'journal', 'unclassified']
      if (!valid.includes(result.classification)) {
        result = FALLBACK_RESULT
      }
    } catch {
      result = FALLBACK_RESULT
    }

    return json(result)
  } catch (e) {
    // Never crash — return unclassified so the app can still save the capture
    console.error('[ai-classifier] Unexpected error:', String(e))
    return json({ ...FALLBACK_RESULT, _debug_error: String(e) })
  }
})
