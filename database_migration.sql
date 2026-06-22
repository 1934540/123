-- Migration Script for AstanaHub Employee

-- 1. Create shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    hub_id uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
    name text NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for shifts
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- 2. Add columns to employees table
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS device_id text;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS position text;

-- 3. Add columns to attendance_logs table
ALTER TABLE public.attendance_logs
ADD COLUMN IF NOT EXISTS location_in_lat double precision,
ADD COLUMN IF NOT EXISTS location_in_lng double precision,
ADD COLUMN IF NOT EXISTS location_out_lat double precision,
ADD COLUMN IF NOT EXISTS location_out_lng double precision,
ADD COLUMN IF NOT EXISTS device_id_used text;
-- Note: 'status' column already exists in attendance_logs, we'll just store different string values ("On Time", "Late", "Early Leave", "present")

-- 4. Create breaks table
CREATE TABLE IF NOT EXISTS public.breaks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    attendance_log_id uuid REFERENCES public.attendance_logs(id) ON DELETE CASCADE NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for breaks
ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;

-- 5. Create director attendance logs table
CREATE TABLE IF NOT EXISTS public.director_attendance_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    hub_id uuid REFERENCES public.hubs(id) ON DELETE SET NULL,
    date date NOT NULL,
    check_in_time timestamp with time zone,
    check_out_time timestamp with time zone,
    work_duration text,
    status text,
    location_in_lat double precision,
    location_in_lng double precision,
    location_out_lat double precision,
    location_out_lng double precision,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, date)
);

ALTER TABLE public.director_attendance_logs ENABLE ROW LEVEL SECURITY;

-- Reload Supabase PostgREST schema cache after DDL changes.
NOTIFY pgrst, 'reload schema';
