// @ts-nocheck
/**
 * Supabase Edge Function: ai-classifier
 *
 * Purpose:
 * - Receive raw text (typed or voice-transcribed)
 * - Call Gemini to decompose it into one or more atomic items (task/shopping/journal)
 * - Return { classification, confidence, items[] } to the Expo app
 *
 * Auth, CORS, retry, and error patterns copied exactly from note-style/index.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type RequestBody = {
  raw_text: string
}

type ItemType = 'task' | 'shopping' | 'journal' | 'unclassified'

type ExtractedItem = {
  type: ItemType
  title?: string
  due_date_hint?: string
  item_name?: string
  quantity?: string
  content?: string
  mood?: string
}

type ClassificationResult = {
  classification: ItemType
  confidence: number
  items: ExtractedItem[]
}

const CLASSIFIER_SYSTEM_PROMPT = `You are a personal life capture assistant. Your job is to read a short note, decompose it into one or more atomic items, classify each item, and extract structured data for each.

A single user input may contain MULTIPLE items across different categories. Break them apart.

Categories (choose the BEST fit per item — prefer a specific category over "unclassified"):
- task: something the user needs to do, remember, or get done
- shopping: something the user needs to buy, pick up, or get from a store
- journal: a feeling, thought, reflection, or personal observation
- unclassified: ONLY use this when an item is truly meaningless or completely ambiguous

Classification tips:
- If it mentions buying, getting, picking up, or any consumable item → shopping
- If it implies an action the user should take → task
- If it expresses a feeling, opinion, or reflection → journal
- Short inputs (1-3 words) are still classifiable. "buy milk" is shopping. "clean room" is a task. "feeling sad" is journal.
- When multiple items are listed (e.g. "eggs, milk, and bread"), create a SEPARATE item for each one.
- When in doubt between categories, pick the most likely one with lower confidence rather than defaulting to unclassified.

Return ONLY valid JSON matching this schema:
{
  "classification": string,  // the dominant category (most items, or first item's type if tied)
  "confidence": number,      // overall confidence between 0 and 1
  "items": [                 // one entry per atomic item extracted
    {
      "type": "task" | "shopping" | "journal" | "unclassified",
      "title": string,         // for task: short action title
      "due_date_hint": string, // for task: if user mentioned a time
      "item_name": string,     // for shopping: the item name
      "quantity": string,      // for shopping: quantity if mentioned
      "content": string,       // for journal: the full entry text
      "mood": string           // for journal: single mood word if detectable
    }
  ]
}

Examples:

Input: "call dentist tomorrow morning"
Output: { "classification": "task", "confidence": 0.97, "items": [{ "type": "task", "title": "Call dentist", "due_date_hint": "tomorrow morning" }] }

Input: "buy milk"
Output: { "classification": "shopping", "confidence": 0.98, "items": [{ "type": "shopping", "item_name": "milk" }] }

Input: "eggs, bread, and butter"
Output: { "classification": "shopping", "confidence": 0.95, "items": [{ "type": "shopping", "item_name": "eggs" }, { "type": "shopping", "item_name": "bread" }, { "type": "shopping", "item_name": "butter" }] }

Input: "buy protein powder and call the gym about membership"
Output: { "classification": "shopping", "confidence": 0.93, "items": [{ "type": "shopping", "item_name": "protein powder" }, { "type": "task", "title": "Call the gym about membership" }] }

Input: "clean the garage"
Output: { "classification": "task", "confidence": 0.95, "items": [{ "type": "task", "title": "Clean the garage" }] }

Input: "feeling really exhausted after today"
Output: { "classification": "journal", "confidence": 0.95, "items": [{ "type": "journal", "content": "Feeling really exhausted after today", "mood": "exhausted" }] }

Input: "pick up groceries, also feeling stressed about the deadline"
Output: { "classification": "shopping", "confidence": 0.88, "items": [{ "type": "shopping", "item_name": "groceries" }, { "type": "journal", "content": "Feeling stressed about the deadline", "mood": "stressed" }] }`

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

const FALLBACK_RESULT: ClassificationResult = {
  classification: 'unclassified',
  confidence: 0,
  items: [{ type: 'unclassified' }],
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
        maxOutputTokens: 512,
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

    // 7) Parse Gemini's JSON response — normalize to items[] format
    let result: ClassificationResult
    try {
      const cleaned = rawOutput.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
      const parsed = JSON.parse(cleaned)

      const valid: ItemType[] = ['task', 'shopping', 'journal', 'unclassified']

      // Normalize: if Gemini returned old format (extracted instead of items), convert
      if (parsed.extracted && !parsed.items) {
        const type = valid.includes(parsed.classification) ? parsed.classification : 'unclassified'
        result = {
          classification: type,
          confidence: parsed.confidence ?? 0,
          items: [{ type, ...parsed.extracted }],
        }
      } else if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        // Validate each item's type
        const items: ExtractedItem[] = parsed.items.map((item: any) => ({
          ...item,
          type: valid.includes(item.type) ? item.type : 'unclassified',
        }))
        result = {
          classification: valid.includes(parsed.classification) ? parsed.classification : items[0].type,
          confidence: parsed.confidence ?? 0,
          items,
        }
      } else {
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
