-- Migration D: journal_entries table

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    capture_id      uuid REFERENCES public.captures(id) ON DELETE SET NULL,
    content         text NOT NULL,
    mood            text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast chronological queries per user
CREATE INDEX IF NOT EXISTS journal_entries_user_created_idx
    ON public.journal_entries (user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop-then-create for idempotency)
DROP POLICY IF EXISTS "journal_entries_select_own" ON public.journal_entries;
CREATE POLICY "journal_entries_select_own"
    ON public.journal_entries FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "journal_entries_insert_own" ON public.journal_entries;
CREATE POLICY "journal_entries_insert_own"
    ON public.journal_entries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "journal_entries_update_own" ON public.journal_entries;
CREATE POLICY "journal_entries_update_own"
    ON public.journal_entries FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "journal_entries_delete_own" ON public.journal_entries;
CREATE POLICY "journal_entries_delete_own"
    ON public.journal_entries FOR DELETE
    USING (auth.uid() = user_id);
