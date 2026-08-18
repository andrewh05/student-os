-- Run once in the Supabase SQL editor for an existing installation.
ALTER TABLE students
ADD COLUMN IF NOT EXISTS political_affiliation VARCHAR(150);
