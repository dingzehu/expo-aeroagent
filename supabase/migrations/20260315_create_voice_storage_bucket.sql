-- Migration E: voice-captures Storage bucket + RLS policies
-- Creates a private bucket for voice recordings and scopes access to each user's own folder.

-- 1) Create the bucket (private — public=false means files are not publicly accessible by URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-captures', 'voice-captures', false)
ON CONFLICT (id) DO NOTHING;

-- 2) RLS policy: users can only upload into their own folder (voice-captures/<user_id>/*)
DROP POLICY IF EXISTS "voice_captures_insert_own" ON storage.objects;
CREATE POLICY "voice_captures_insert_own"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'voice-captures'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 3) RLS policy: users can only read their own folder
DROP POLICY IF EXISTS "voice_captures_select_own" ON storage.objects;
CREATE POLICY "voice_captures_select_own"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'voice-captures'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 4) RLS policy: users can only delete their own files
DROP POLICY IF EXISTS "voice_captures_delete_own" ON storage.objects;
CREATE POLICY "voice_captures_delete_own"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'voice-captures'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
