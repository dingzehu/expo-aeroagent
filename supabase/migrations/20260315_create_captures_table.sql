-- Migration A: captures table
-- Central source of truth for all user input (text or voice)

CREATE TABLE IF NOT EXISTS public.captures (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    raw_text        text,
    raw_audio_url   text,
    classification  text NOT NULL DEFAULT 'unclassified',
    ai_confidence   numeric,
    extracted_data  jsonb,
    source          text NOT NULL DEFAULT 'text',
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast feed queries (newest captures first per user)
CREATE INDEX IF NOT EXISTS captures_user_created_idx
    ON public.captures (user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop-then-create for idempotency)
DROP POLICY IF EXISTS "captures_select_own" ON public.captures;
CREATE POLICY "captures_select_own"
    ON public.captures FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "captures_insert_own" ON public.captures;
CREATE POLICY "captures_insert_own"
    ON public.captures FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "captures_update_own" ON public.captures;
CREATE POLICY "captures_update_own"
    ON public.captures FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "captures_delete_own" ON public.captures;
CREATE POLICY "captures_delete_own"
    ON public.captures FOR DELETE
    USING (auth.uid() = user_id);
