ALTER TABLE public.registered_students
  ADD COLUMN IF NOT EXISTS pin_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;