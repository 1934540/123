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

-- Reload Supabase PostgREST schema cache after DDL changes.
NOTIFY pgrst, 'reload schema';
