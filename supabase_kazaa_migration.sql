-- Run in the Supabase SQL Editor to support saving kazaa (district) assignments
ALTER TABLE students ADD COLUMN IF NOT EXISTS kazaa TEXT NOT NULL DEFAULT '';
