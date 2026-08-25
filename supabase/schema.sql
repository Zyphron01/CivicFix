-- CivicFix Supabase Schema Migration (Phase 5B)

create table if not exists issues (
  id text primary key,
  canonical_title text not null,
  category text not null,
  status text not null,
  priority_level text not null,
  priority_score integer not null,
  ward_id text not null,
  department_id text,
  latitude double precision not null,
  longitude double precision not null,
  address_text text not null,
  report_count integer not null default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists reports (
  id text primary key,
  issue_id text references issues(id) on delete cascade not null,
  citizen_id text not null,
  description text not null,
  image_url text,
  latitude double precision not null,
  longitude double precision not null,
  ward_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists assignments (
  id text primary key,
  issue_id text references issues(id) on delete cascade not null,
  department_id text not null,
  field_worker_id text,
  assigned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  target_resolution_date timestamp with time zone not null,
  notes text
);

create table if not exists status_history (
  id text primary key,
  issue_id text references issues(id) on delete cascade not null,
  previous_status text,
  new_status text not null,
  changed_by text not null,
  comment text,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists resolution_evidence (
  id text primary key,
  issue_id text references issues(id) on delete cascade not null,
  field_worker_id text not null,
  before_image_url text not null,
  after_image_url text not null,
  work_summary text not null,
  submitted_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists verification_results (
  id text primary key,
  issue_id text references issues(id) on delete cascade not null,
  ai_confidence_score double precision not null,
  ai_match_detected boolean not null,
  ai_explanation text not null,
  verified_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists ai_triage_assessments (
  id text primary key,
  issue_id text references issues(id) on delete cascade not null,
  category text not null,
  severity text not null,
  urgency text not null,
  impact text not null,
  priority_score integer not null,
  priority_level text not null,
  reasoning text not null,
  recommended_department text not null,
  work_summary text not null,
  model text,
  provider text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_ai_triage_issue_id on ai_triage_assessments(issue_id);
