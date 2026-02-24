-- Profiles table for storing user display names
--
-- Notes:
-- - id matches auth.users(id) — one profile per user
-- - display_name is non-nullable (defaults to 'Aero User')
-- - display_name is non-unique — multiple users can share a name
-- - RLS policies restrict each user to their own row
-- Run this in the Supabase SQL Editor (or via Supabase CLI migrations).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Aero User',
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
