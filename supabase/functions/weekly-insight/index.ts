// @ts-nocheck
/**
 * Supabase Edge Function: weekly-insight
 *
 * Purpose:
 * - Fetch user's data from the last 7 days (tasks, captures, journal entries)
 * - Send to Gemini for a warm, specific 2-sentence observation
 * - Return { tasksCompleted, captureCount, topMood, insight }
 *
 * Auth pattern copied exactly from ai-classifier/index.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

    if (!geminiApiKey) {
      return json({ error: 'Missing GEMINI_API_KEY secret in Supabase' }, 500)
    }

    // 4) Verify user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401)
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

    // 5) Query last 7 days of data
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [tasksRes, capturesRes, journalsRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, completed')
        .eq('user_id', user.id)
        .gte('created_at', since),
      supabase
        .from('captures')
        .select('id, raw_text, classification')
        .eq('user_id', user.id)
        .gte('created_at', since),
      supabase
        .from('journal_entries')
        .select('content, mood')
        .eq('user_id', user.id)
        .gte('created_at', since),
    ])

    const allTasks = tasksRes.data ?? []
    const allCaptures = capturesRes.data ?? []
    const allJournals = journalsRes.data ?? []

    // 6) Compute summary stats
    const completedTasks = allTasks.filter((t) => t.completed)
    const tasksCompleted = completedTasks.length
    const captureCount = allCaptures.length

    // Most frequent non-null mood
    const moodCounts: Record<string, number> = {}
    for (const j of allJournals) {
      if (j.mood) {
        moodCounts[j.mood] = (moodCounts[j.mood] ?? 0) + 1
      }
    }
    const topMood =
      Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // 7) Build Gemini prompt context
    const taskTitles = completedTasks
      .map((t) => t.title)
      .slice(0, 10)
      .join(', ')
    const captureSamples = allCaptures
      .slice(0, 15)
      .map((c) => c.raw_text)
      .filter(Boolean)
      .join('; ')
    const moodList = allJournals
      .map((j) => j.mood)
      .filter(Boolean)
      .join(', ')

    const context = [
      `Tasks completed this week (${tasksCompleted}): ${taskTitles || 'none'}`,
      `Total captures this week: ${captureCount}`,
      `Moods recorded: ${moodList || 'none'}`,
      `Sample captures: ${captureSamples || 'none'}`,
    ].join('\n')

    // 8) Call Gemini for the insight
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`
    const geminiBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Given these captures from the past week:\n\n${context}\n\nWrite one warm and specific observation about this person's week in 2 sentences. Be concrete, not generic. Reference what they actually did and how they seemed to feel. If there is no data, write an encouraging message about starting fresh.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 180,
      },
    }

    let insight = "You're building momentum — every capture is a step forward."

    const geminiResp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    })

    if (geminiResp.ok) {
      const geminiJson = await geminiResp.json()
      const raw =
        geminiJson?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p?.text ?? '')
          .join('') ?? ''
      if (raw.trim()) {
        insight = raw.trim()
      }
    } else {
      console.error('[weekly-insight] Gemini error:', geminiResp.status, await geminiResp.text())
    }

    return json({ tasksCompleted, captureCount, topMood, insight })
  } catch (e) {
    console.error('[weekly-insight] Unexpected error:', String(e))
    return json({ error: String(e) }, 500)
  }
})
