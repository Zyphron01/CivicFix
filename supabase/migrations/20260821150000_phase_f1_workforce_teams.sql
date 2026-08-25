-- Phase F1 Migration: Workforce & Team Architecture
-- Created at: 2026-08-21 15:00:00

-- =========================================================================
-- 1. TEAMS & TEAM MEMBERS TABLES DEFINITION
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    specialization TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    lead_worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('LEAD', 'MEMBER')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_team_worker UNIQUE(team_id, worker_id)
);

-- Additive columns on assignments
ALTER TABLE public.assignments 
ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'INDIVIDUAL' CHECK (target_type IN ('INDIVIDUAL', 'TEAM')),
ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES public.teams(id) ON DELETE SET NULL;

-- Additive columns on issues
ALTER TABLE public.issues 
ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES public.teams(id) ON DELETE SET NULL;

-- =========================================================================
-- 2. SEED WORKFORCE DEMO TEAMS & SECOND WORKER FOR ISOLATION TESTING
-- =========================================================================

-- Provision second demo field worker for team isolation tests (worker.demo2@civicfix.local)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
VALUES (
    'c9f8e7d6-5c4b-3a21-0fed-9876543210fe',
    'worker.demo2@civicfix.local',
    '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF',
    now(),
    '{"full_name": "Sanitation Emergency Field Crew"}'::jsonb,
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role)
VALUES ('c9f8e7d6-5c4b-3a21-0fed-9876543210fe', 'Sanitation Emergency Field Crew', 'FIELD_WORKER')
ON CONFLICT (id) DO UPDATE SET role = 'FIELD_WORKER';

-- Seed operational teams
INSERT INTO public.teams (id, name, description, specialization, lead_worker_id)
VALUES 
    ('team-roads', 'Roads & Asphalt Response Crew', 'Rapid asphalt patching and road hazard resolution team', 'POTHOLE', 'c5f6fd21-6b34-4606-a767-bdae3026c3ab'),
    ('team-sanitation', 'Sanitation & Drainage Emergency Unit', 'High-pressure drain clearance and waste disposal crew', 'GARBAGE', 'c9f8e7d6-5c4b-3a21-0fed-9876543210fe')
ON CONFLICT (id) DO NOTHING;

-- Seed team memberships
INSERT INTO public.team_members (id, team_id, worker_id, role)
VALUES 
    ('tm-roads-1', 'team-roads', 'c5f6fd21-6b34-4606-a767-bdae3026c3ab', 'LEAD'),
    ('tm-sanitation-1', 'team-sanitation', 'c9f8e7d6-5c4b-3a21-0fed-9876543210fe', 'LEAD')
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 3. ENABLE RLS & DEFINE TEAM-AWARE RLS POLICIES
-- =========================================================================

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teams select authenticated" ON public.teams;
DROP POLICY IF EXISTS "Teams admin manage" ON public.teams;

CREATE POLICY "Teams select authenticated" ON public.teams
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teams admin manage" ON public.teams
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Team members select authenticated" ON public.team_members;
DROP POLICY IF EXISTS "Team members admin manage" ON public.team_members;

CREATE POLICY "Team members select authenticated" ON public.team_members
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team members admin manage" ON public.team_members
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Update RLS policies on assignments to be team-aware
DROP POLICY IF EXISTS "Assignments select scoped" ON public.assignments;
CREATE POLICY "Assignments select scoped" ON public.assignments
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR field_worker_id = auth.uid()::text
        OR team_id IN (
            SELECT tm.team_id FROM public.team_members tm WHERE tm.worker_id = auth.uid()
        )
    );

-- Update RLS policies on issues to be team-aware
DROP POLICY IF EXISTS "Issues select scoped" ON public.issues;
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
            AND (
                assignments.field_worker_id = auth.uid()::text
                OR assignments.team_id IN (
                    SELECT tm.team_id FROM public.team_members tm WHERE tm.worker_id = auth.uid()
                )
            )
        )
    );
