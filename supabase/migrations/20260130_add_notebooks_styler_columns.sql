-- Note-Styler AI schema upgrade for `notebooks`
--
-- Goal:
-- - Store both raw and formatted markdown + selected persona style.
--
-- IMPORTANT beginner notes:
-- 1) Run this in Supabase SQL Editor (or via Supabase CLI migrations).
-- 2) This is safe to run multiple times because we use "if not exists".

alter table public.notebooks
  add column if not exists raw_content text;

alter table public.notebooks
  add column if not exists formatted_content text;

alter table public.notebooks
  add column if not exists selected_style text;

-- Optional: If you previously used `body` for raw notes, you can backfill:
-- update public.notebooks set raw_content = body where raw_content is null and body is not null;

