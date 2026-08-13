-- Run once in the Supabase SQL Editor before encrypting existing records.
-- Ciphertext is longer than plaintext, so encrypted columns must use TEXT.
ALTER TABLE public.students
  ALTER COLUMN first_name TYPE TEXT,
  ALTER COLUMN father_name TYPE TEXT,
  ALTER COLUMN family_name TYPE TEXT,
  ALTER COLUMN origin TYPE TEXT,
  ALTER COLUMN address TYPE TEXT,
  ALTER COLUMN school TYPE TEXT,
  ALTER COLUMN major TYPE TEXT,
  ALTER COLUMN status TYPE TEXT,
  ALTER COLUMN language TYPE TEXT,
  ALTER COLUMN campus TYPE TEXT,
  ALTER COLUMN phone TYPE TEXT,
  ALTER COLUMN email TYPE TEXT;

ALTER TABLE public.users
  ALTER COLUMN username TYPE TEXT,
  ALTER COLUMN password TYPE TEXT,
  ALTER COLUMN full_name TYPE TEXT,
  ALTER COLUMN role TYPE TEXT;
