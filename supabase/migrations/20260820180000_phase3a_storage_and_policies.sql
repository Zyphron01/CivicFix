-- =========================================================================
-- CIVICFIX — PHASE 3A MIGRATION
-- SECURE STORAGE BUCKET & PATH-RESTRICTED RLS POLICIES
-- =========================================================================

-- 1. Create dedicated private storage bucket for evidence photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'civicfix-evidence',
    'civicfix-evidence',
    false, -- Private bucket access
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- 2. Drop legacy or conflicting storage policies if re-running
DROP POLICY IF EXISTS "Public Read Evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Insert Evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Evidence" ON storage.objects;
DROP POLICY IF EXISTS "CivicFix Authenticated Read Evidence" ON storage.objects;
DROP POLICY IF EXISTS "CivicFix Path Scoped Insert Evidence" ON storage.objects;
DROP POLICY IF EXISTS "CivicFix Owner Delete Evidence" ON storage.objects;

-- 3. Policy: Allow authenticated users to view evidence objects
CREATE POLICY "CivicFix Authenticated Read Evidence" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'civicfix-evidence');

-- 4. Policy: Restrict upload object paths to user's auth.uid() folder:
--    reports/{auth.uid()}/filename OR resolutions/{auth.uid()}/filename
CREATE POLICY "CivicFix Path Scoped Insert Evidence" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'civicfix-evidence'
    AND (
        (name LIKE 'reports/' || auth.uid()::text || '/%')
        OR
        (name LIKE 'resolutions/' || auth.uid()::text || '/%')
    )
);

-- 5. Policy: Allow authenticated users to delete their own uploaded files
CREATE POLICY "CivicFix Owner Delete Evidence" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'civicfix-evidence'
    AND owner = auth.uid()
);
