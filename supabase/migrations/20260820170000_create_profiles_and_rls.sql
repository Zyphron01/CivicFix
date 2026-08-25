-- Migration: Create profiles table and establish hardened relationship-based RLS policies
-- Created at: 2026-08-20 17:00:00
-- Revised at: 2026-08-20 17:37:00

-- =========================================================================
-- 1. PROFILES TABLE DEFINITION & EXISTING USERS BACKFILL
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CITIZEN' CHECK (role IN ('CITIZEN', 'MUNICIPAL_ADMIN', 'FIELD_WORKER')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Idempotent backfill for existing auth.users
INSERT INTO public.profiles (id, full_name, role)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', 'Anonymous Citizen'), 'CITIZEN'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 2. HARDENED ROLE HELPER FUNCTIONS (SECURITY DEFINER)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'MUNICIPAL_ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_field_worker()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'FIELD_WORKER'
  );
$$;

-- =========================================================================
-- 3. HARDENED REGISTRATION TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', 'Anonymous Citizen'),
        'CITIZEN' -- Enforces CITIZEN role on public signup, ignoring any client role metadata
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- 4. ATOMIC CITIZEN REPORT SUBMISSION RPC (OPTION A)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.submit_citizen_report(
    p_title TEXT,
    p_description TEXT,
    p_category TEXT,
    p_ward_id TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_address_text TEXT,
    p_image_url TEXT DEFAULT NULL,
    p_priority_level TEXT DEFAULT 'MEDIUM',
    p_priority_score INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_citizen_id TEXT;
    v_issue_id TEXT;
    v_report_id TEXT;
    v_history_id TEXT;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Strictly verify authentication using server-side auth.uid()
    v_citizen_id := auth.uid()::text;
    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User must be authenticated to submit a report';
    END IF;

    -- 2. Validate required inputs
    IF p_title IS NULL OR trim(p_title) = '' THEN
        RAISE EXCEPTION 'Validation error: Title is required';
    END IF;
    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'Validation error: Description is required';
    END IF;
    IF p_category IS NULL OR trim(p_category) = '' THEN
        RAISE EXCEPTION 'Validation error: Category is required';
    END IF;
    IF p_ward_id IS NULL OR trim(p_ward_id) = '' THEN
        RAISE EXCEPTION 'Validation error: Ward ID is required';
    END IF;
    IF p_latitude IS NULL OR p_longitude IS NULL THEN
        RAISE EXCEPTION 'Validation error: Latitude and longitude are required';
    END IF;

    -- 3. Deterministically generate IDs
    v_issue_id := 'issue-' || gen_random_uuid()::text;
    v_report_id := 'report-' || gen_random_uuid()::text;
    v_history_id := 'sh-' || gen_random_uuid()::text;

    -- 4. Atomically insert canonical issue
    INSERT INTO public.issues (
        id,
        canonical_title,
        category,
        status,
        priority_level,
        priority_score,
        ward_id,
        latitude,
        longitude,
        address_text,
        report_count,
        created_at,
        updated_at
    ) VALUES (
        v_issue_id,
        trim(p_title),
        p_category,
        'SUBMITTED',
        COALESCE(p_priority_level, 'MEDIUM'),
        COALESCE(p_priority_score, 50),
        p_ward_id,
        p_latitude,
        p_longitude,
        COALESCE(p_address_text, 'Unknown Location'),
        1,
        v_now,
        v_now
    );

    -- 5. Atomically insert report tied directly to auth.uid()
    INSERT INTO public.reports (
        id,
        issue_id,
        citizen_id,
        description,
        image_url,
        latitude,
        longitude,
        ward_id,
        created_at
    ) VALUES (
        v_report_id,
        v_issue_id,
        v_citizen_id,
        trim(p_description),
        p_image_url,
        p_latitude,
        p_longitude,
        p_ward_id,
        v_now
    );

    -- 6. Atomically insert initial status history
    INSERT INTO public.status_history (
        id,
        issue_id,
        previous_status,
        new_status,
        changed_by,
        comment,
        timestamp
    ) VALUES (
        v_history_id,
        v_issue_id,
        NULL,
        'SUBMITTED',
        v_citizen_id,
        'Initial report submitted',
        v_now
    );

    -- 7. Return atomic creation summary
    RETURN jsonb_build_object(
        'issue_id', v_issue_id,
        'report_id', v_report_id,
        'status', 'SUBMITTED',
        'created_at', v_now
    );
END;
$$;

-- =========================================================================
-- 5. FUNCTION PRIVILEGES & ACCESS CONTROL
-- =========================================================================

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_field_worker() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_citizen_report(TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_field_worker() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_citizen_report(TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, INTEGER) TO authenticated;

-- =========================================================================
-- 6. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- =========================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resolution_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_triage_assessments ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 7. IDEMPOTENT POLICY CLEANUP (DROP ALL EXISTING POLICIES)
-- =========================================================================

-- PROFILES
DROP POLICY IF EXISTS "Profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles admin manage" ON public.profiles;

-- ISSUES
DROP POLICY IF EXISTS "Issues select scoped" ON public.issues;
DROP POLICY IF EXISTS "Issues admin insert" ON public.issues;
DROP POLICY IF EXISTS "Issues update scoped" ON public.issues;
DROP POLICY IF EXISTS "Issues admin delete" ON public.issues;

-- REPORTS
DROP POLICY IF EXISTS "Reports select scoped" ON public.reports;
DROP POLICY IF EXISTS "Reports admin manage" ON public.reports;

-- ASSIGNMENTS
DROP POLICY IF EXISTS "Assignments select scoped" ON public.assignments;
DROP POLICY IF EXISTS "Assignments admin manage" ON public.assignments;

-- STATUS HISTORY
DROP POLICY IF EXISTS "Status select scoped" ON public.status_history;
DROP POLICY IF EXISTS "Status insert worker" ON public.status_history;
DROP POLICY IF EXISTS "Status admin update" ON public.status_history;
DROP POLICY IF EXISTS "Status admin delete" ON public.status_history;

-- RESOLUTION EVIDENCE
DROP POLICY IF EXISTS "Evidence select scoped" ON public.resolution_evidence;
DROP POLICY IF EXISTS "Evidence insert worker" ON public.resolution_evidence;
DROP POLICY IF EXISTS "Evidence admin manage" ON public.resolution_evidence;

-- VERIFICATION RESULTS
DROP POLICY IF EXISTS "Verification select scoped" ON public.verification_results;
DROP POLICY IF EXISTS "Verification admin manage" ON public.verification_results;

-- AI TRIAGE ASSESSMENTS (including legacy policies from initial migration)
DROP POLICY IF EXISTS "Allow public read access to ai_triage_assessments" ON public.ai_triage_assessments;
DROP POLICY IF EXISTS "Allow public insert access to ai_triage_assessments" ON public.ai_triage_assessments;
DROP POLICY IF EXISTS "Allow authenticated read to ai_triage_assessments" ON public.ai_triage_assessments;
DROP POLICY IF EXISTS "Allow authenticated insert to ai_triage_assessments" ON public.ai_triage_assessments;
DROP POLICY IF EXISTS "Triage select scoped" ON public.ai_triage_assessments;
DROP POLICY IF EXISTS "Triage admin manage" ON public.ai_triage_assessments;

-- =========================================================================
-- 8. GRANULAR RELATIONSHIP-BASED RLS POLICIES
-- =========================================================================

-- -------------------------------------------------------------------------
-- PROFILES
-- -------------------------------------------------------------------------
CREATE POLICY "Profiles select own" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Profiles admin manage" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- -------------------------------------------------------------------------
-- ISSUES
-- -------------------------------------------------------------------------
CREATE POLICY "Issues select scoped" ON public.issues
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.reports 
            WHERE reports.issue_id = issues.id 
            AND reports.citizen_id = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.issue_id = issues.id 
            AND assignments.field_worker_id = auth.uid()::text
        )
    );

CREATE POLICY "Issues admin insert" ON public.issues
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "Issues update scoped" ON public.issues
    FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.issue_id = issues.id 
            AND assignments.field_worker_id = auth.uid()::text
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.issue_id = issues.id 
            AND assignments.field_worker_id = auth.uid()::text
        )
    );

CREATE POLICY "Issues admin delete" ON public.issues
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- -------------------------------------------------------------------------
-- REPORTS
-- -------------------------------------------------------------------------
CREATE POLICY "Reports select scoped" ON public.reports
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR citizen_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.issue_id = reports.issue_id 
            AND assignments.field_worker_id = auth.uid()::text
        )
    );

CREATE POLICY "Reports admin manage" ON public.reports
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- -------------------------------------------------------------------------
-- ASSIGNMENTS
-- -------------------------------------------------------------------------
CREATE POLICY "Assignments select scoped" ON public.assignments
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR field_worker_id = auth.uid()::text
    );

CREATE POLICY "Assignments admin manage" ON public.assignments
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- -------------------------------------------------------------------------
-- STATUS HISTORY
-- -------------------------------------------------------------------------
CREATE POLICY "Status select scoped" ON public.status_history
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.reports 
            WHERE reports.issue_id = status_history.issue_id 
            AND reports.citizen_id = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.issue_id = status_history.issue_id 
            AND assignments.field_worker_id = auth.uid()::text
        )
    );

CREATE POLICY "Status insert worker" ON public.status_history
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR (
            changed_by = auth.uid()::text
            AND EXISTS (
                SELECT 1 FROM public.assignments 
                WHERE assignments.issue_id = status_history.issue_id 
                AND assignments.field_worker_id = auth.uid()::text
            )
        )
    );

CREATE POLICY "Status admin update" ON public.status_history
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Status admin delete" ON public.status_history
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- -------------------------------------------------------------------------
-- RESOLUTION EVIDENCE
-- -------------------------------------------------------------------------
CREATE POLICY "Evidence select scoped" ON public.resolution_evidence
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.reports 
            WHERE reports.issue_id = resolution_evidence.issue_id 
            AND reports.citizen_id = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.issue_id = resolution_evidence.issue_id 
            AND assignments.field_worker_id = auth.uid()::text
        )
    );

CREATE POLICY "Evidence insert worker" ON public.resolution_evidence
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR (
            field_worker_id = auth.uid()::text
            AND EXISTS (
                SELECT 1 FROM public.assignments 
                WHERE assignments.issue_id = resolution_evidence.issue_id 
                AND assignments.field_worker_id = auth.uid()::text
            )
        )
    );

CREATE POLICY "Evidence admin manage" ON public.resolution_evidence
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- -------------------------------------------------------------------------
-- VERIFICATION RESULTS
-- -------------------------------------------------------------------------
CREATE POLICY "Verification select scoped" ON public.verification_results
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.reports 
            WHERE reports.issue_id = verification_results.issue_id 
            AND reports.citizen_id = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.issue_id = verification_results.issue_id 
            AND assignments.field_worker_id = auth.uid()::text
        )
    );

CREATE POLICY "Verification admin manage" ON public.verification_results
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- -------------------------------------------------------------------------
-- AI TRIAGE ASSESSMENTS
-- -------------------------------------------------------------------------
CREATE POLICY "Triage select scoped" ON public.ai_triage_assessments
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.reports 
            WHERE reports.issue_id = ai_triage_assessments.issue_id 
            AND reports.citizen_id = auth.uid()::text
        )
        OR EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.issue_id = ai_triage_assessments.issue_id 
            AND assignments.field_worker_id = auth.uid()::text
        )
    );

CREATE POLICY "Triage admin manage" ON public.ai_triage_assessments
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
