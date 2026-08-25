-- Migration: Step 3.1 AI Triage Schema Enhancement & Secure RPC (Corrected)
-- Created at: 2026-08-20 19:00:00

-- 1. Add missing multimodal & triage assessment columns to public.ai_triage_assessments
ALTER TABLE public.ai_triage_assessments 
ADD COLUMN IF NOT EXISTS is_civic_issue BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS hazard_classification TEXT,
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS in_jurisdiction BOOLEAN DEFAULT TRUE;

-- 2. Create dedicated SECURITY DEFINER RPC to save AI triage assessments securely
CREATE OR REPLACE FUNCTION public.save_ai_triage_assessment(
    p_issue_id TEXT,
    p_category TEXT,
    p_severity TEXT,
    p_urgency TEXT,
    p_impact TEXT,
    p_priority_score INTEGER,
    p_priority_level TEXT,
    p_reasoning TEXT,
    p_recommended_department TEXT,
    p_work_summary TEXT,
    p_is_civic_issue BOOLEAN DEFAULT TRUE,
    p_hazard_classification TEXT DEFAULT NULL,
    p_confidence_score NUMERIC DEFAULT 1.0,
    p_in_jurisdiction BOOLEAN DEFAULT TRUE,
    p_model TEXT DEFAULT 'google/gemini-2.5-flash',
    p_provider TEXT DEFAULT 'openrouter/llm'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id TEXT;
    v_assessment_id TEXT;
    v_existing_id TEXT;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Verify caller authentication
    v_caller_id := auth.uid()::text;
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User must be authenticated to save triage assessment';
    END IF;

    -- 2. Validate issue existence
    IF NOT EXISTS (SELECT 1 FROM public.issues WHERE id = p_issue_id) THEN
        RAISE EXCEPTION 'Validation error: Specified issue_id does not exist';
    END IF;

    -- 3. Verify caller authorization (MUNICIPAL_ADMIN or Citizen Owner of the Report)
    IF NOT (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.reports 
            WHERE reports.issue_id = p_issue_id 
            AND reports.citizen_id = v_caller_id
        )
    ) THEN
        RAISE EXCEPTION 'Access denied: User is not authorized to save triage assessment for this issue';
    END IF;

    -- 4. Validate numerical bounds
    IF p_priority_score IS NULL OR p_priority_score < 0 OR p_priority_score > 100 THEN
        RAISE EXCEPTION 'Validation error: Priority score must be an integer between 0 and 100';
    END IF;

    IF p_confidence_score IS NOT NULL AND (p_confidence_score < 0.0 OR p_confidence_score > 1.0) THEN
        RAISE EXCEPTION 'Validation error: Confidence score must be between 0.0 and 1.0';
    END IF;

    -- 5. Check if an assessment already exists for this issue
    SELECT id INTO v_existing_id 
    FROM public.ai_triage_assessments 
    WHERE issue_id = p_issue_id 
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- If caller is citizen, prevent overwriting existing assessment
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access denied: Triage assessment already exists for this issue and cannot be overwritten by citizen';
        END IF;

        -- Admin update path
        UPDATE public.ai_triage_assessments SET
            category = p_category,
            severity = p_severity,
            urgency = p_urgency,
            impact = p_impact,
            priority_score = p_priority_score,
            priority_level = p_priority_level,
            reasoning = p_reasoning,
            recommended_department = p_recommended_department,
            work_summary = p_work_summary,
            is_civic_issue = COALESCE(p_is_civic_issue, TRUE),
            hazard_classification = p_hazard_classification,
            confidence_score = COALESCE(p_confidence_score, 1.0),
            in_jurisdiction = COALESCE(p_in_jurisdiction, TRUE),
            model = p_model,
            provider = p_provider,
            updated_at = v_now
        WHERE id = v_existing_id;

        RETURN jsonb_build_object(
            'status', 'SUCCESS',
            'action', 'UPDATED',
            'assessment_id', v_existing_id,
            'issue_id', p_issue_id,
            'saved_at', v_now
        );
    ELSE
        -- Insert new assessment record
        v_assessment_id := 'triage-' || gen_random_uuid()::text;

        INSERT INTO public.ai_triage_assessments (
            id,
            issue_id,
            category,
            severity,
            urgency,
            impact,
            priority_score,
            priority_level,
            reasoning,
            recommended_department,
            work_summary,
            is_civic_issue,
            hazard_classification,
            confidence_score,
            in_jurisdiction,
            model,
            provider,
            created_at,
            updated_at
        ) VALUES (
            v_assessment_id,
            p_issue_id,
            p_category,
            p_severity,
            p_urgency,
            p_impact,
            p_priority_score,
            p_priority_level,
            p_reasoning,
            p_recommended_department,
            p_work_summary,
            COALESCE(p_is_civic_issue, TRUE),
            p_hazard_classification,
            COALESCE(p_confidence_score, 1.0),
            COALESCE(p_in_jurisdiction, TRUE),
            p_model,
            p_provider,
            v_now,
            v_now
        );

        RETURN jsonb_build_object(
            'status', 'SUCCESS',
            'action', 'CREATED',
            'assessment_id', v_assessment_id,
            'issue_id', p_issue_id,
            'saved_at', v_now
        );
    END IF;
END;
$$;

-- 3. Restrict execution permissions to authenticated users only
REVOKE ALL ON FUNCTION public.save_ai_triage_assessment(
    TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, BOOLEAN, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_ai_triage_assessment(
    TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, BOOLEAN, TEXT, TEXT
) TO authenticated;
