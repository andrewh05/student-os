-- Run once in the Supabase SQL Editor to support language section group buttons (Grp A,B / Grp C,D / Grp E1 / Grp E2)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS assigned_group TEXT NOT NULL DEFAULT '';
