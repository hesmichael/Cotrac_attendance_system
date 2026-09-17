-- ==============================================================================
-- COTRAC Attendance & Biometric Security Portal
-- Supabase Database Schema DDL
-- Run this SQL in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS public.users (
    uid TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'sign-in')),
    employee_id TEXT,
    pin TEXT,
    shift_start TEXT DEFAULT '09:00',
    shift_end TEXT DEFAULT '17:00',
    registered_signature TEXT,
    lateness_tolerance INTEGER DEFAULT 15,
    password TEXT,
    biometrics_enabled BOOLEAN DEFAULT FALSE,
    biometric_type TEXT DEFAULT 'face',
    face_photo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Attendance Records Table (Personnel & Visitors)
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    date TEXT NOT NULL,
    clock_in TEXT NOT NULL,
    clock_out TEXT,
    total_hours NUMERIC(5,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Present' CHECK (status IN ('Present', 'Late', 'Incomplete')),
    clock_in_signature TEXT,
    clock_out_signature TEXT,
    signature_match_percentage INTEGER,
    signature_match_verified BOOLEAN,
    signature_match_reason TEXT,
    biometric_verified BOOLEAN DEFAULT FALSE,
    biometric_type TEXT,
    biometric_stamp TEXT,
    clock_out_biometric_verified BOOLEAN DEFAULT FALSE,
    clock_out_biometric_type TEXT,
    clock_out_biometric_stamp TEXT,
    authorized_by TEXT,
    authorized_by_name TEXT,
    pin_verified BOOLEAN DEFAULT FALSE,
    verification_method TEXT,
    is_visitor BOOLEAN DEFAULT FALSE,
    visitor_email TEXT,
    visitor_host TEXT,
    visitor_purpose TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Operational Activities Table (Audit Log)
CREATE TABLE IF NOT EXISTS public.activities (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT,
    user_name TEXT,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 5. Set up RLS Policies for Anon / Authenticated Access
-- (Permissive for application anon key access)
DROP POLICY IF EXISTS "Allow anon read users" ON public.users;
CREATE POLICY "Allow anon read users" ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon upsert users" ON public.users;
CREATE POLICY "Allow anon upsert users" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read attendance" ON public.attendance_records;
CREATE POLICY "Allow anon read attendance" ON public.attendance_records FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon write attendance" ON public.attendance_records;
CREATE POLICY "Allow anon write attendance" ON public.attendance_records FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read activities" ON public.activities;
CREATE POLICY "Allow anon read activities" ON public.activities FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon insert activities" ON public.activities;
CREATE POLICY "Allow anon insert activities" ON public.activities FOR ALL USING (true) WITH CHECK (true);

-- 6. Create Helpful Indexes for High Performance Queries
CREATE INDEX IF NOT EXISTS idx_records_user_id ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_records_date ON public.attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_records_is_visitor ON public.attendance_records(is_visitor);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON public.activities(timestamp DESC);
