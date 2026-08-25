-- Migration: Create public.ai_triage_assessments table
-- Created at: 2026-08-20 12:40:25

CREATE TABLE IF NOT EXISTS public.ai_triage_assessments (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    urgency TEXT NOT NULL,
    impact TEXT NOT NULL,
    priority_score INTEGER NOT NULL,
    priority_level TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    recommended_department TEXT NOT NULL,
    work_summary TEXT NOT NULL,
    model TEXT,
    provider TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_ai_triage_issue_id ON public.ai_triage_assessments(issue_id);

-- Row Level Security (RLS)
ALTER TABLE public.ai_triage_assessments ENABLE ROW LEVEL SECURITY;

-- Enable public select and insert policies to match client expectations
CREATE POLICY "Allow public read access to ai_triage_assessments"
ON public.ai_triage_assessments
FOR SELECT
USING (true);

CREATE POLICY "Allow public insert access to ai_triage_assessments"
ON public.ai_triage_assessments
FOR INSERT
WITH CHECK (true);
