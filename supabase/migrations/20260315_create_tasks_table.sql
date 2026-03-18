-- Migration B: tasks table (user-scoped, replaces the old public tasks table)

CREATE TABLE IF NOT EXISTS public.tasks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    capture_id      uuid REFERENCES public.captures(id) ON DELETE SET NULL,
    title           text NOT NULL,
    completed       boolean NOT NULL DEFAULT false,
    completed_at    timestamptz,
    due_date        timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast list queries (active tasks first per user)
CREATE INDEX IF NOT EXISTS tasks_user_completed_created_idx
    ON public.tasks (user_id, completed, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop-then-create for idempotency)
DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
CREATE POLICY "tasks_select_own"
    ON public.tasks FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tasks_insert_own" ON public.tasks;
CREATE POLICY "tasks_insert_own"
    ON public.tasks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tasks_update_own" ON public.tasks;
CREATE POLICY "tasks_update_own"
    ON public.tasks FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tasks_delete_own" ON public.tasks;
CREATE POLICY "tasks_delete_own"
    ON public.tasks FOR DELETE
    USING (auth.uid() = user_id);
