-- Migration C: shopping_items table

CREATE TABLE IF NOT EXISTS public.shopping_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    capture_id      uuid REFERENCES public.captures(id) ON DELETE SET NULL,
    item_name       text NOT NULL,
    quantity        text,
    completed       boolean NOT NULL DEFAULT false,
    completed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast list queries (active items first per user)
CREATE INDEX IF NOT EXISTS shopping_items_user_completed_created_idx
    ON public.shopping_items (user_id, completed, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop-then-create for idempotency)
DROP POLICY IF EXISTS "shopping_items_select_own" ON public.shopping_items;
CREATE POLICY "shopping_items_select_own"
    ON public.shopping_items FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_items_insert_own" ON public.shopping_items;
CREATE POLICY "shopping_items_insert_own"
    ON public.shopping_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_items_update_own" ON public.shopping_items;
CREATE POLICY "shopping_items_update_own"
    ON public.shopping_items FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_items_delete_own" ON public.shopping_items;
CREATE POLICY "shopping_items_delete_own"
    ON public.shopping_items FOR DELETE
    USING (auth.uid() = user_id);
