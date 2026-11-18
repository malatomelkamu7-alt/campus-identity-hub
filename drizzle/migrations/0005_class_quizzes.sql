CREATE TABLE public.class_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id text NOT NULL,
  bank_id uuid,
  subject text NOT NULL,
  title text NOT NULL,
  stream text NOT NULL,
  sections text[] NOT NULL DEFAULT '{}',
  duration_sec integer NOT NULL DEFAULT 1200,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  given text,
  status text NOT NULL DEFAULT 'live',
  results_released boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
GRANT ALL ON public.class_quizzes TO service_role;
ALTER TABLE public.class_quizzes ENABLE ROW LEVEL SECURITY;
CREATE INDEX class_quizzes_teacher_idx ON public.class_quizzes(teacher_id);

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.class_quizzes(id) ON DELETE CASCADE,
  student_code text NOT NULL REFERENCES public.registered_students(student_code) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  violations integer NOT NULL DEFAULT 0,
  score integer,
  total integer,
  current_question integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  blocked_at timestamptz,
  last_seen_at timestamptz,
  UNIQUE (quiz_id, student_code)
);
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;