# AeroAgent v1 — Scratchpad Capture MVP
# Claude Code Task File
# Place this file at: expo-aeroagent/tasks/v1_scratchpad_capture_mvp.md
# Run with: claude then > read CLAUDE.md and tasks/v1_scratchpad_capture_mvp.md carefully, then ask me before doing anything

---

## BEFORE YOU START — READ THIS FIRST

1. Read CLAUDE.md in the project root. It contains all coding patterns, protected files,
   colour palette, and architecture rules you must follow. Do not proceed until you have
   read it.

2. This is a long-term commercial product targeting 10,000 EUR monthly recurring revenue.
   Every decision must prioritise: user retention, speed, and reliability over clever code.

3. You have access to a design skill called ui-ux-pro-max-skill. Use it for every screen
   and every UI component you build in this task. Apply it the same way the skill
   description says, for example: "Build a capture screen for a fast-capture SaaS mobile app".
   Do not build any UI without consulting this skill first.

4. DATABASE RULE — CRITICAL: You must never connect to Supabase directly or use any
   Supabase MCP tool. For every database change (new table, schema change, RLS policy,
   index, function, trigger), you must:
   a. Generate a plain .sql file inside supabase/migrations/
   b. Name it: YYYYMMDD_description.sql (example: 20260315_create_captures_table.sql)
   c. Use "if not exists" and "if exists" guards so it is safe to re-run
   d. After generating the file, stop and tell me exactly:
      - The file path
      - What the SQL does in plain English
      - Where to run it: Supabase Dashboard > SQL Editor > paste and run
      - Whether I need to run it before or after any app code change
   Never assume the migration has been run. Always ask me to confirm before
   writing app code that depends on new tables or columns.

5. Show me every file you plan to create or modify BEFORE writing it. Wait for my
   approval. Build one step at a time. Do not jump ahead.

6. When you are unsure about a decision, ask me. Do not guess and implement.

---

## WHAT WE ARE BUILDING IN v1

AeroAgent v1 is an AI-powered capture app. The core loop is:

  User opens app → sees Scratchpad → types or speaks → AI classifies the input
  → saves to the correct bucket (Task / Shopping / Journal / Unclassified)
  → user sees it appear instantly in the day's capture history

That is the entire v1. Nothing more. No advanced features, no dashboards, no analytics.
Speed of capture and reliability of classification are the only things that matter.

The three classification buckets for v1:
  - TASK: something the user needs to do ("call dentist", "submit report by Friday")
  - SHOPPING: something the user needs to buy ("protein powder", "new headphones")
  - JOURNAL: a feeling, reflection, or personal note ("feeling tired today", "great meeting")
  - UNCLASSIFIED: anything that does not clearly fit the above three

---

## STEP 1 — DATABASE MIGRATIONS (Do this step first, do not touch app code yet)

Generate the following SQL migration files. After generating each one, stop and show me
the file. Wait for my confirmation that I have run it in Supabase before continuing.

### Migration A: captures table
File: supabase/migrations/20260315_create_captures_table.sql

This table is the single source of truth for everything a user captures.

  captures:
    id              uuid primary key default gen_random_uuid()
    user_id         uuid not null references auth.users(id) on delete cascade
    raw_text        text                        -- original text typed or transcribed
    raw_audio_url   text                        -- Supabase Storage URL if voice input
    classification  text default 'unclassified' -- 'task' | 'shopping' | 'journal' | 'unclassified'
    ai_confidence   numeric                     -- 0.0 to 1.0, how confident the AI was
    extracted_data  jsonb                       -- structured fields the AI extracted
    source          text default 'text'         -- 'text' | 'voice'
    created_at      timestamptz default now()

  Enable RLS. Policy: user can only read and write their own rows (auth.uid() = user_id).

  Add index on (user_id, created_at DESC) for fast feed queries.

### Migration B: tasks table
File: supabase/migrations/20260315_create_tasks_table.sql

  tasks:
    id              uuid primary key default gen_random_uuid()
    user_id         uuid not null references auth.users(id) on delete cascade
    capture_id      uuid references public.captures(id) on delete set null
    title           text not null
    completed       boolean default false
    completed_at    timestamptz
    due_date        timestamptz
    created_at      timestamptz default now()
    updated_at      timestamptz default now()

  Enable RLS. Same policy pattern.
  Add index on (user_id, completed, created_at DESC).

  NOTE: The existing tasks table in the project has no user_id and is incomplete.
  Do not modify the existing tasks table. Create this new one. I will decide later
  whether to drop the old one.

### Migration C: shopping_items table
File: supabase/migrations/20260315_create_shopping_items_table.sql

  shopping_items:
    id              uuid primary key default gen_random_uuid()
    user_id         uuid not null references auth.users(id) on delete cascade
    capture_id      uuid references public.captures(id) on delete set null
    item_name       text not null
    quantity        text                        -- "2 boxes", "some" — free text, not a number
    completed       boolean default false
    completed_at    timestamptz
    created_at      timestamptz default now()

  Enable RLS. Same policy pattern.

### Migration D: journal_entries table
File: supabase/migrations/20260315_create_journal_entries_table.sql

  journal_entries:
    id              uuid primary key default gen_random_uuid()
    user_id         uuid not null references auth.users(id) on delete cascade
    capture_id      uuid references public.captures(id) on delete set null
    content         text not null
    mood            text                        -- single word extracted by AI: 'tired', 'happy', etc.
    created_at      timestamptz default now()

  Enable RLS. Same policy pattern.

After generating all four migration files, stop. Tell me which ones to run and in what
order. Wait for me to confirm all four have been run before going to Step 2.

---

## STEP 2 — SUPABASE EDGE FUNCTION: ai-classifier

File to create: supabase/functions/ai-classifier/index.ts

This is the brain of the app. It receives raw text and returns a classification
decision plus extracted structured data.

Copy the authentication pattern, CORS handling, error handling, and retry logic
exactly from supabase/functions/note-style/index.ts. Do not modify that file.
Do not deviate from its patterns.

### What this function must do:

Input (POST body):
  {
    raw_text: string    -- the text to classify (from typing or from STT transcription)
  }

Processing:
  Call Gemini Flash 2.0 using the GEMINI_API_KEY secret (already configured in Supabase).
  Use the following system prompt exactly as written:

  "You are a personal life capture assistant. Your job is to read a short note and
  classify it into exactly one category, then extract the relevant structured data.

  Categories:
  - task: something the user needs to do or remember to do
  - shopping: something the user needs to buy
  - journal: a feeling, thought, reflection, or personal observation
  - unclassified: anything that does not clearly fit the above

  Return ONLY valid JSON. No explanation. No markdown. No code fences.
  Schema:
  {
    classification: 'task' | 'shopping' | 'journal' | 'unclassified',
    confidence: number between 0 and 1,
    extracted: {
      title?: string,         -- for task: short action title
      due_date_hint?: string, -- for task: if user mentioned a time ('Friday', 'tomorrow')
      item_name?: string,     -- for shopping: the item name
      quantity?: string,      -- for shopping: quantity if mentioned
      content?: string,       -- for journal: the full entry text
      mood?: string,          -- for journal: single mood word if detectable
    }
  }

  Examples:
  Input: 'call dentist tomorrow morning'
  Output: { classification: 'task', confidence: 0.97, extracted: { title: 'Call dentist', due_date_hint: 'tomorrow morning' } }

  Input: 'need to buy protein powder'
  Output: { classification: 'shopping', confidence: 0.99, extracted: { item_name: 'protein powder' } }

  Input: 'feeling really exhausted after today'
  Output: { classification: 'journal', confidence: 0.95, extracted: { content: 'Feeling really exhausted after today', mood: 'exhausted' } }"

Output:
  {
    classification: string,
    confidence: number,
    extracted: object
  }

Error handling: if Gemini returns a non-parseable response, return classification
'unclassified' with confidence 0. Never crash — a saved unclassified item is better
than a failed save.

Show me the complete file before writing it. Wait for my approval.

---

## STEP 3 — SUPABASE EDGE FUNCTION: voice-transcribe (ElevenLabs Scribe)

File to create: supabase/functions/voice-transcribe/index.ts

IMPORTANT STT CHOICE: Use ElevenLabs Scribe API. Reasons:
  - Best multilingual accuracy in current benchmarks (99 languages)
  - Outperforms Deepgram Nova-3 and Whisper on non-English languages
  - Critical for our user base which includes Chinese and English speakers
  - Returns structured JSON with word-level timestamps
  - NOT OpenAI — project owner explicitly avoids all OpenAI products

The secret key name to use: ELEVENLABS_API_KEY
Tell me after generating this file: "Add your ElevenLabs API key to Supabase:
Dashboard > Project Settings > Edge Functions > Secrets > Add ELEVENLABS_API_KEY"

Copy auth and CORS patterns from note-style/index.ts exactly.

### What this function must do:

Input (POST body):
  {
    audio_storage_path: string  -- path in Supabase Storage bucket 'voice-captures'
  }

Processing:
  1. Download the audio file from Supabase Storage using the service role key
     (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) — never expose this to the client
  2. Send the audio to ElevenLabs Scribe:
     POST https://api.elevenlabs.io/v1/speech-to-text
     Headers: xi-api-key: <ELEVENLABS_API_KEY>
     Body: FormData with the audio file
     Model: scribe_v1
  3. Return the transcribed text

Output:
  {
    transcript: string,
    language_detected: string   -- return this so we can log it for debugging
  }

Error handling: if transcription fails, return { error: 'Transcription failed' } with
HTTP 422 so the app can show the user a friendly retry message.

Show me the complete file before writing it. Wait for my approval.

---

## STEP 4 — SUPABASE STORAGE BUCKET

Generate a SQL migration file for this, do not create it via MCP or CLI:

File: supabase/migrations/20260315_create_voice_storage_bucket.sql

The SQL should:
  1. Insert into storage.buckets: id='voice-captures', name='voice-captures', public=false
  2. Add RLS policy on storage.objects so users can only upload to and read from
     a folder matching their own user_id:
     - INSERT policy: bucket_id='voice-captures' AND (storage.foldername(name))[1] = auth.uid()::text
     - SELECT policy: same condition

Tell me to run this in Supabase SQL Editor and wait for confirmation.

---

## STEP 5 — HOME SCREEN REDESIGN (app/index.tsx)

Now we build UI. Use your ui-ux-pro-max-skill for this screen.
Prompt the skill as if building: "A fast-capture scratchpad screen for a personal AI
life assistant mobile app — clean, minimal, premium feel."

### What this screen must contain (from top to bottom):

TOP SECTION — Stats bar (makes the app feel alive):
  - Show "X captures this week" — fetch count of captures where user_id = current user
    and created_at >= start of current week (Monday 00:00 local time)
  - Show "Last capture: Xh ago" or "Last capture: Xm ago" or "Just now"
    based on the most recent captures.created_at for this user
  - If no captures yet, show "Start your first capture below"
  - These should auto-refresh when a new capture is saved (use Supabase realtime)
  - Use the colour palette from CLAUDE.md. Keep this section subtle — not the main focus.

MIDDLE SECTION — Scratchpad (the main feature):
  - Large multiline TextInput — placeholder: "What's on your mind?"
  - No title field. No notebook selector. No category picker. Just type and go.
  - Below the input: one row with two buttons side by side:
      Left button:  microphone icon — hold to record voice note
      Right button: send/capture button — submits the text
  - The mic button behaviour:
      On press: start recording (use expo-av Audio)
      On release: stop recording, upload to Supabase Storage bucket 'voice-captures',
        call voice-transcribe Edge Function, put the transcript into the TextInput,
        then automatically submit (same flow as text)
  - While recording: show a pulsing red dot animation on the mic button
  - While processing voice: show "Transcribing..." text below the input
  - While AI is classifying: show "Classifying..." text below the input
  - On success: clear the input and show a brief inline confirmation (see below)

  After a successful capture, show an inline confirmation chip that auto-dismisses after
  2.5 seconds. The chip shows the classification result:
    - Task: "✓ Saved as Task"
    - Shopping: "✓ Added to Shopping"
    - Journal: "✓ Journal entry saved"
    - Unclassified: "✓ Captured"
  Use the SUCCESS colour (#10B981) for the chip background. Do not use Alert.alert().

TODAY'S CAPTURES — scrollable list below the input:
  - Show all captures for today (created_at >= today 00:00 local time), newest first
  - Each item shows:
      Classification badge (coloured pill): TASK | SHOPPING | JOURNAL | NOTE
      The raw_text (truncated to 2 lines)
      Time: "2m ago", "1h ago", etc.
  - Badge colours:
      TASK:     indigo (#6366F1) background, white text
      SHOPPING: amber (#D97706) background, white text
      JOURNAL:  green (#10B981) background, white text
      NOTE:     gray (#6B7280) background, white text
  - Tapping an item does nothing in v1 (we will add detail view in v2)
  - If no captures today: show empty state "No captures yet today. Start above."
  - Use Supabase realtime so new captures appear instantly without refresh

BOTTOM SECTION — Keep the original navigation buttons:
  - Move the existing "Thoughts" and "Open Task Manager" buttons to the bottom of the
    screen. Do not remove them. Style them as ghost buttons (border only, no fill) so
    they are clearly secondary to the scratchpad above.

### Capture flow (implement this exactly):

1. User types text OR voice transcription fills the input
2. User taps send button (or voice auto-submits)
3. Show "Classifying..." state
4. Call ai-classifier Edge Function with { raw_text: inputText }
5. On response, insert one row into captures table:
     user_id, raw_text, classification, ai_confidence, extracted_data, source
6. Based on classification, also insert into the module table:
     'task'     → insert into tasks (title from extracted.title, due_date_hint ignored for now)
     'shopping' → insert into shopping_items (item_name from extracted.item_name)
     'journal'  → insert into journal_entries (content from extracted.content, mood from extracted.mood)
     'unclassified' → no secondary insert, just the captures row is enough
7. Show the confirmation chip
8. Clear the input
9. The realtime subscription updates the today's captures list automatically

Error handling: if the Edge Function call fails, save the capture with
classification='unclassified' and show "✓ Captured (offline mode)". Never lose
user input. A saved unclassified item is always better than a failed save.

Install expo-av if not already installed: npx expo install expo-av
Check package.json first before installing anything.

Show me the complete screen design and code plan before writing any files.
Wait for my approval.

---

## STEP 6 — BOTTOM TAB NAVIGATION (app/_layout.tsx)

The package @react-navigation/bottom-tabs is already installed in package.json.
Add bottom tab navigation to _layout.tsx.

Four tabs:
  Tab 1: Capture  — icon: mic-outline      — points to app/index.tsx
  Tab 2: Tasks    — icon: checkmark-circle-outline — points to app/tasks.tsx (new, see Step 7)
  Tab 3: Shopping — icon: cart-outline     — points to app/shopping.tsx (new, see Step 7)
  Tab 4: Journal  — icon: book-outline     — points to app/journal.tsx (new, see Step 7)

Rules:
  - Only show the tab bar when the user is logged in (session?.user exists)
  - Keep all existing auth modal logic (profile popover, login modal) unchanged
  - Keep ProfileHeader visible on all four tabs
  - Active tab colour: #6366F1 (INDIGO from CLAUDE.md)
  - Inactive tab colour: #9CA3AF
  - Tab bar background: white, with a subtle top border (#E5E7EB)
  - Do not remove or break any existing auth or modal code in _layout.tsx

Show me the modified _layout.tsx plan before touching the file.

---

## STEP 7 — THREE MODULE SCREENS (Simple Views Only)

For each screen, use your ui-ux-pro-max-skill.
Prompt it as: "A clean, minimal list screen for [Tasks / Shopping list / Journal]
in a personal AI life assistant mobile app."

### app/tasks.tsx

Header: "Tasks" with count of incomplete tasks in a badge
List: all tasks for current user where completed = false, ordered by created_at DESC
Each row:
  - Checkbox on the left (tap to toggle completed — update tasks.completed and completed_at)
  - task.title text
  - Soft timestamp: "Added 2h ago"
  - Swipe left to delete (or a simple delete icon — choose whichever is simpler to implement)
Completed tasks: show a collapsible "Completed" section below the active list (collapsed by default)
Empty state: "No tasks yet. Capture one above." with a button that navigates to Capture tab.
Realtime: subscribe to tasks table changes for this user.

### app/shopping.tsx

Header: "Shopping" with count of unchecked items
List: all shopping_items for current user where completed = false, ordered by created_at DESC
Each row:
  - Checkbox (tap to toggle completed)
  - item_name
  - quantity if not null (shown as a grey pill next to the name)
Completed section: same collapsible pattern as tasks
Empty state: "Nothing on your list. Capture items above."
Realtime: subscribe to shopping_items table changes.

### app/journal.tsx

Header: "Journal"
List: all journal_entries for current user, ordered by created_at DESC
Each row (card style):
  - Date in the top left: "Mon 15 Mar"
  - Mood badge in the top right if mood is not null (e.g. "😴 exhausted")
  - content text (up to 4 lines, truncated with "...")
  - Tap to expand full entry inline (no navigation to new screen in v1)
Empty state: "No journal entries yet. Capture a thought above."
Realtime: subscribe to journal_entries table changes.

Show me each screen plan before writing any files. Build them one at a time.
Wait for my approval after each one.

---

## STEP 8 — INSTALL REQUIRED PACKAGE

Before Step 5, check if expo-av is in package.json.
If it is not: run   npx expo install expo-av
If it is: skip this step entirely.

Tell me the result before proceeding to Step 5.

---

## WHAT v1 DOES NOT INCLUDE — DO NOT BUILD THESE

Do not add any of the following in this task, even if it seems logical:

  - Note styling personas (Executive, Social, Summarize, Academic) — already exists, do not extend
  - Finance module
  - Weekly AI summaries or insights
  - Paywall or subscription logic (RevenueCat)
  - Lock screen widget
  - Profile screen changes
  - Changes to thoughts.tsx or notes.tsx (those are protected — see CLAUDE.md)
  - Any changes to lib/supabase.ts
  - Any changes to supabase/functions/note-style/
  - Search or filtering within module screens
  - Note detail screens (tapping a capture item does nothing in v1)
  - Due date functionality for tasks (store the hint text but do not build a date picker)

If you think something not on this list is necessary, ask me first.

---

## BUILD ORDER — FOLLOW THIS SEQUENCE EXACTLY

Do not skip steps. Do not combine steps. Complete one, get my approval, then continue.

  Step 1:  Generate all 4 migration SQL files → wait for me to run them
  Step 2:  Build ai-classifier Edge Function → wait for my approval
  Step 3:  Build voice-transcribe Edge Function → wait for my approval and API key setup
  Step 4:  Generate storage bucket migration SQL → wait for me to run it
  Step 5:  Check expo-av installation
  Step 6:  Build app/index.tsx (Scratchpad screen) → wait for my approval
  Step 7:  Add bottom tab navigation to app/_layout.tsx → wait for my approval
  Step 8:  Build app/tasks.tsx → wait for my approval
  Step 9:  Build app/shopping.tsx → wait for my approval
  Step 10: Build app/journal.tsx → wait for my approval

After Step 10 is approved and tested, the v1 MVP is complete.

---

## HOW TO START

Read this file fully. Then read CLAUDE.md fully. Then tell me:
  1. Which files you have read and understood
  2. Your plan for Step 1 (the four migration files)
  3. Any questions you have before starting

Do not write a single line of code or SQL until you have told me your plan for Step 1
and I have said "go ahead".
