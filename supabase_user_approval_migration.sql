-- Run once in Supabase SQL Editor before enabling public account requests.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE;
