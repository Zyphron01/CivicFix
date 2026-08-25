-- Migration: Phase F6 / Moderation & Real GPS Location Enhancements
-- Description: Adds moderation states, audit fields, and real GPS accuracy tracking to issues and reports.

-- 1. Add moderation & GPS columns to public.issues
ALTER TABLE public.issues 
  ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by TEXT,
  ADD COLUMN IF NOT EXISTS location_source TEXT DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC;

-- 2. Add GPS tracking columns to public.reports
ALTER TABLE public.reports 
  ADD COLUMN IF NOT EXISTS location_source TEXT DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC;

-- 3. Add index for operational queries filtering out REJECTED or ARCHIVED reports
CREATE INDEX IF NOT EXISTS idx_issues_moderation_status ON public.issues (moderation_status);

-- 4. Backfill existing issues to ACTIVE if moderation_status is NULL
UPDATE public.issues SET moderation_status = 'ACTIVE' WHERE moderation_status IS NULL;
UPDATE public.issues SET location_source = 'MANUAL' WHERE location_source IS NULL;
UPDATE public.reports SET location_source = 'MANUAL' WHERE location_source IS NULL;
