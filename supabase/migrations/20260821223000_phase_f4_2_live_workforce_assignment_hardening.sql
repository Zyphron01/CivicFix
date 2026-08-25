-- ====================================================================
-- CIVICFIX PHASE F4.3 — HARDENED WORKFORCE & ASSIGNMENT MIGRATION
-- Safe Backfill & Staged Target Integrity Constraint Deployment
-- ====================================================================

-- STEP 1: Create Teams Table (lead_worker_id uses UUID to match profiles.id)
CREATE TABLE IF NOT EXISTS public.teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    specialization TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    lead_worker_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- STEP 2: Create Team Members Table (worker_id uses UUID to match profiles.id)
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('LEAD', 'MEMBER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(team_id, worker_id)
);

-- STEP 3: Seed Operational Teams First (so foreign keys for team_id are valid)
INSERT INTO public.teams (id, name, description, specialization, is_active, lead_worker_id)
VALUES 
  ('team-roads', 'Roads & Asphalt Response Crew', 'Rapid asphalt patching and road hazard resolution team', 'POTHOLE', true, 'c5f6fd21-6b34-4606-a767-bdae3026c3ab'::uuid),
  ('team-sanitation', 'Sanitation & Drainage Emergency Unit', 'High-pressure drain clearance and waste disposal crew', 'GARBAGE', true, 'c5f6fd21-6b34-4606-a767-bdae3026c3ab'::uuid)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, specialization = EXCLUDED.specialization;

INSERT INTO public.team_members (team_id, worker_id, role)
VALUES 
  ('team-roads', 'c5f6fd21-6b34-4606-a767-bdae3026c3ab'::uuid, 'LEAD'),
  ('team-sanitation', 'c5f6fd21-6b34-4606-a767-bdae3026c3ab'::uuid, 'LEAD')
ON CONFLICT (team_id, worker_id) DO NOTHING;

-- STEP 4: Add Additive Columns Safely
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_assignment_id TEXT,
  ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES public.teams(id);

ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES public.teams(id);

-- STEP 5: Backfill Existing Legacy Assignment Data BEFORE Constraint Creation
-- A. Backfill legacy team assignments from notes
UPDATE public.assignments
SET target_type = 'TEAM',
    team_id = 'team-sanitation'
WHERE notes LIKE '%TEAM_ID:team-sanitation%' AND (team_id IS NULL OR target_type != 'TEAM');

UPDATE public.assignments
SET target_type = 'TEAM',
    team_id = 'team-roads'
WHERE notes LIKE '%TEAM_ID:team-roads%' AND (team_id IS NULL OR target_type != 'TEAM');

-- B. Mark historical superseded notes as is_active = false
UPDATE public.assignments
SET is_active = false
WHERE (notes LIKE 'SUPERSEDED|%' OR notes LIKE 'IS_ACTIVE:FALSE%') AND is_active IS NOT false;

-- C. Mark unassigned legacy rows without worker or team as is_active = false
UPDATE public.assignments
SET is_active = false
WHERE field_worker_id IS NULL AND team_id IS NULL AND is_active IS NOT false;

-- D. Ensure at most one active assignment per issue (keep latest assignment active)
WITH ranked_assignments AS (
  SELECT id, issue_id,
         ROW_NUMBER() OVER (PARTITION BY issue_id ORDER BY assigned_at DESC) as rn
  FROM public.assignments
  WHERE is_active IS true OR is_active IS NULL
)
UPDATE public.assignments
SET is_active = false
WHERE id IN (
  SELECT id FROM ranked_assignments WHERE rn > 1
);

-- STEP 6: Add Target Integrity Constraint ONLY AFTER Data Backfill
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS chk_assignment_target_integrity;

ALTER TABLE public.assignments
  ADD CONSTRAINT chk_assignment_target_integrity CHECK (
    (is_active = false)
    OR
    (target_type = 'INDIVIDUAL' AND field_worker_id IS NOT NULL AND team_id IS NULL)
    OR
    (target_type = 'TEAM' AND team_id IS NOT NULL AND field_worker_id IS NULL)
  );

-- STEP 7: Create Partial Unique Index for Single Active Assignment
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_single_active 
ON public.assignments (issue_id) 
WHERE (is_active = true);

-- STEP 8: Create Atomic Reassignment Stored Procedure
CREATE OR REPLACE FUNCTION public.reassign_issue(
  p_issue_id TEXT,
  p_department_id TEXT,
  p_target_type TEXT,
  p_field_worker_id TEXT DEFAULT NULL,
  p_team_id TEXT DEFAULT NULL,
  p_admin_id TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_assignment_id TEXT;
  v_timestamp TIMESTAMPTZ := timezone('utc'::text, now());
  v_target_date TIMESTAMPTZ := v_timestamp + INTERVAL '3 days';
  v_new_target TEXT;
  v_audit_comment TEXT;
  v_result JSONB;
BEGIN
  IF p_target_type = 'INDIVIDUAL' AND (p_field_worker_id IS NULL OR p_team_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid target: INDIVIDUAL requires field_worker_id and NULL team_id.';
  ELSIF p_target_type = 'TEAM' AND (p_team_id IS NULL OR p_field_worker_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid target: TEAM requires team_id and NULL field_worker_id.';
  END IF;

  v_new_assignment_id := 'asg-' || extract(epoch from v_timestamp)::bigint;
  v_new_target := CASE WHEN p_target_type = 'TEAM' THEN 'Team:' || p_team_id ELSE 'Worker:' || p_field_worker_id END;

  UPDATE public.assignments
  SET is_active = false,
      superseded_at = v_timestamp,
      superseded_by_assignment_id = v_new_assignment_id
  WHERE issue_id = p_issue_id AND is_active = true;

  INSERT INTO public.assignments (
    id, issue_id, department_id, field_worker_id, team_id, target_type,
    is_active, assigned_at, target_resolution_date, notes
  ) VALUES (
    v_new_assignment_id, p_issue_id, p_department_id, p_field_worker_id, p_team_id, p_target_type,
    true, v_timestamp, v_target_date, 'IS_ACTIVE:TRUE|TARGET_TYPE:' || p_target_type
  );

  UPDATE public.issues
  SET department_id = p_department_id,
      team_id = p_team_id,
      status = 'ASSIGNED',
      updated_at = v_timestamp
  WHERE id = p_issue_id;

  v_audit_comment := 'REASSIGNMENT: Reassigned target to [' || v_new_target || '] (TargetType: ' || p_target_type || ')';
  INSERT INTO public.status_history (
    id, issue_id, previous_status, new_status, changed_by, comment, timestamp
  ) VALUES (
    'sh-' || extract(epoch from v_timestamp)::bigint,
    p_issue_id, 'SUBMITTED', 'ASSIGNED', p_admin_id, v_audit_comment, v_timestamp
  );

  v_result := jsonb_build_object(
    'assignment_id', v_new_assignment_id,
    'issue_id', p_issue_id,
    'target_type', p_target_type,
    'status', 'ASSIGNED'
  );

  RETURN v_result;
END;
$$;
