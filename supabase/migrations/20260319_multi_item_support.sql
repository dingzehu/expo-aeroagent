-- Migration: Multi-item capture support
-- Adds manual_correction flag for future ML learning from user reclassifications (v2)

ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS manual_correction boolean NOT NULL DEFAULT false;

ALTER TABLE public.shopping_items
    ADD COLUMN IF NOT EXISTS manual_correction boolean NOT NULL DEFAULT false;

ALTER TABLE public.journal_entries
    ADD COLUMN IF NOT EXISTS manual_correction boolean NOT NULL DEFAULT false;
