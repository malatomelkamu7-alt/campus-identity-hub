-- lovable-cron-fallback-reviewed: Time-based exam opening/closing must work without viewers; the minute-level job is armed only while Auto has a future closing time and unschedules itself after closing, completion or disabling.
CREATE TABLE public.school_roster (
 id text PRIMARY KEY, full_name text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('student','teacher')),
 grade text NOT NULL DEFAULT '12', section text NOT NULL DEFAULT '',
 stream text NOT NULL, gender text NOT NULL DEFAULT '', subjects text[] NOT NULL DEFAULT '{}',
 batch text NOT NULL DEFAULT 'Batch 1'
);
COMMENT ON COLUMN public.school_roster.batch IS 'Upload batch label; new Excel uploads get a new batch so previous batches stay stored.';
GRANT ALL ON public.school_roster TO service_role;
ALTER TABLE public.school_roster ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.registered_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code text NOT NULL UNIQUE,
  full_name text NOT NULL, grade text NOT NULL DEFAULT '12',
  section text NOT NULL, stream text NOT NULL, gender text NOT NULL,
  photo_path text NOT NULL, face_verified boolean NOT NULL DEFAULT false,
  roster_id text REFERENCES public.school_roster(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_token text, session_seen_at timestamptz,
  results_pin_hash text
);
CREATE UNIQUE INDEX registered_students_roster_unique ON public.registered_students(roster_id);
GRANT ALL ON public.registered_students TO service_role;
ALTER TABLE public.registered_students ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.question_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL, title text NOT NULL,
  teacher_id text REFERENCES public.school_roster(id),
  status text NOT NULL DEFAULT 'draft' CONSTRAINT question_banks_status_check CHECK (status IN ('draft','queued','archived')),
  questions jsonb NOT NULL DEFAULT '[]',
  target_stream text CONSTRAINT bank_target_stream CHECK (target_stream IN ('Natural Science','Social Science')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.question_banks TO service_role;
ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exam_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  exam_live boolean NOT NULL DEFAULT false,
  results_published boolean NOT NULL DEFAULT false,
  registration_open boolean NOT NULL DEFAULT true,
  sat_enabled boolean NOT NULL DEFAULT false,
  current_round int NOT NULL DEFAULT 1,
  active_bank_id uuid,
  duration_sec int NOT NULL DEFAULT 3600,
  ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  scheduled_start timestamptz, scheduled_close timestamptz,
  extension_sec integer NOT NULL DEFAULT 0,
  auto_schedule boolean NOT NULL DEFAULT false,
  social_bank_id uuid REFERENCES public.question_banks(id),
  selected_student_codes text[],
  auto_completed boolean NOT NULL DEFAULT false,
  hidden_staff_roles text[] NOT NULL DEFAULT '{}',
  auto_close boolean NOT NULL DEFAULT true
);
COMMENT ON COLUMN public.exam_settings.ends_at IS 'DEPRECATED: individual deadlines are stored on exam_attempts';
GRANT ALL ON public.exam_settings TO service_role;
ALTER TABLE public.exam_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.exam_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round int NOT NULL, bank_id uuid NOT NULL REFERENCES public.question_banks(id),
  student_code text NOT NULL REFERENCES public.registered_students(student_code) ON UPDATE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','blocked')),
  answers jsonb NOT NULL DEFAULT '{}', violations int NOT NULL DEFAULT 0,
  score int, total int, started_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
  deadline_at timestamptz, paused_at timestamptz,
  last_seen_at timestamptz, current_question integer NOT NULL DEFAULT 0,
  pause_reason text, bonus_questions text[] NOT NULL DEFAULT '{}',
  results_reset_at timestamptz,
  UNIQUE (round, bank_id, student_code)
);
GRANT ALL ON public.exam_attempts TO service_role;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exam_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL, student_code text NOT NULL, message text NOT NULL,
  round int, teacher_id text, bank_id uuid, question_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz, teacher_dismissed_at timestamptz
);
GRANT ALL ON public.exam_events TO service_role;
ALTER TABLE public.exam_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.round_results (
  round int NOT NULL, student_code text NOT NULL, subject text NOT NULL,
  score_pct int NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round, student_code, subject)
);
GRANT ALL ON public.round_results TO service_role;
ALTER TABLE public.round_results ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staff_credentials (
  role TEXT PRIMARY KEY CONSTRAINT staff_credentials_role_check CHECK (role IN ('director','teacher') OR role LIKE 'teacher:%'),
  passcode TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff_credentials TO service_role;
ALTER TABLE public.staff_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exam_rounds (round integer PRIMARY KEY, archived_at timestamptz);
GRANT ALL ON public.exam_rounds TO service_role;
ALTER TABLE public.exam_rounds ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_edit_identity_name(person_id text, person_target text, new_name text) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE linked_id text;
BEGIN
 IF length(trim(new_name)) < 3 OR length(new_name) > 100 THEN RAISE EXCEPTION 'Invalid name'; END IF;
 IF person_target = 'roster' THEN
  UPDATE public.school_roster SET full_name = new_name WHERE id = person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  UPDATE public.registered_students SET full_name = new_name WHERE roster_id = person_id;
 ELSIF person_target = 'registered' THEN
  UPDATE public.registered_students SET full_name = new_name WHERE student_code = person_id RETURNING roster_id INTO linked_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF linked_id IS NOT NULL THEN UPDATE public.school_roster SET full_name = new_name WHERE id = linked_id; END IF;
 ELSE RAISE EXCEPTION 'Invalid target'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.admin_edit_identity_name(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_identity_name(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.save_exam_submission(p_attempt uuid, p_answers jsonb, p_status text, p_violations integer) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a public.exam_attempts; qs jsonb; earned integer; possible integer; subj text;
BEGIN
 SELECT * INTO a FROM public.exam_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
 SELECT questions,subject INTO qs,subj FROM public.question_banks WHERE id=a.bank_id;
 IF a.status <> 'in_progress' THEN RETURN; END IF;
 SELECT COALESCE(sum(CASE WHEN (p_answers->>(q->>'id'))::integer = (q->>'answer')::integer OR (q->>'id') = ANY(a.bonus_questions) THEN (q->>'marks')::integer ELSE 0 END),0), COALESCE(sum((q->>'marks')::integer),0) INTO earned,possible FROM jsonb_array_elements(qs) q;
 UPDATE public.exam_attempts SET answers=p_answers,status=p_status,violations=p_violations,score=earned,total=possible,submitted_at=now(),paused_at=NULL,pause_reason=NULL WHERE id=p_attempt;
 INSERT INTO public.round_results(round,student_code,subject,score_pct) VALUES(a.round,a.student_code,subj,CASE WHEN possible>0 THEN round(earned*100.0/possible) ELSE 0 END) ON CONFLICT(round,student_code,subject) DO UPDATE SET score_pct=EXCLUDED.score_pct,updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.save_exam_submission(uuid,jsonb,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_submission(uuid,jsonb,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.extend_exam_minutes(p_minutes integer) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s public.exam_settings;
BEGIN
 IF p_minutes<1 OR p_minutes>180 THEN RAISE EXCEPTION 'Invalid minutes'; END IF;
 SELECT * INTO s FROM public.exam_settings WHERE id=1 FOR UPDATE;
 UPDATE public.exam_settings SET extension_sec=extension_sec+p_minutes*60,scheduled_close=CASE WHEN auto_schedule THEN scheduled_close+make_interval(mins=>p_minutes) ELSE scheduled_close END,updated_at=now() WHERE id=1;
 UPDATE public.exam_attempts SET deadline_at=deadline_at+make_interval(mins=>p_minutes) WHERE round=s.current_round AND bank_id IN(s.active_bank_id,s.social_bank_id) AND status='in_progress';
END; $$;
REVOKE ALL ON FUNCTION public.extend_exam_minutes(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.extend_exam_minutes(integer) TO service_role;

-- Freezes the timer of a student whose device stopped reporting (power or internet loss) at the moment it was last seen.
CREATE OR REPLACE FUNCTION public.pause_disconnected_attempts(p_grace_sec integer) RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE n integer;
BEGIN
 UPDATE public.exam_attempts SET paused_at=last_seen_at, pause_reason='connection'
 WHERE status='in_progress' AND paused_at IS NULL AND last_seen_at IS NOT NULL
   AND last_seen_at < now()-make_interval(secs=>p_grace_sec) AND deadline_at > last_seen_at;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.pause_disconnected_attempts(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pause_disconnected_attempts(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.director_attempt_time(p_attempt uuid, p_action text, p_minutes integer) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF p_action='extend' THEN
  IF p_minutes IS NULL OR p_minutes<1 OR p_minutes>180 THEN RAISE EXCEPTION 'Invalid minutes'; END IF;
  UPDATE public.exam_attempts SET deadline_at=deadline_at+make_interval(mins=>p_minutes) WHERE id=p_attempt AND status='in_progress';
 ELSIF p_action='pause' THEN
  UPDATE public.exam_attempts SET paused_at=now(), pause_reason='director' WHERE id=p_attempt AND status='in_progress' AND paused_at IS NULL AND deadline_at>now();
 ELSIF p_action='resume' THEN
  UPDATE public.exam_attempts SET deadline_at=deadline_at+(now()-paused_at), paused_at=NULL, pause_reason=NULL, last_seen_at=now() WHERE id=p_attempt AND status='in_progress' AND paused_at IS NOT NULL;
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt is not active'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.director_attempt_time(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.director_attempt_time(uuid,text,integer) TO service_role;

-- Gives the full marks of one question to chosen attempts (NULL codes = everyone who sat it), once per question per attempt. Reset results stay reset.
CREATE OR REPLACE FUNCTION public.award_question_marks(p_bank uuid, p_round integer, p_question text, p_codes text[]) RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE qs jsonb; subj text; qmarks integer; a public.exam_attempts; bonus text[]; earned integer; possible integer; gained integer := 0; was_right boolean;
BEGIN
 SELECT questions,subject INTO qs,subj FROM public.question_banks WHERE id=p_bank;
 IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
 SELECT (q->>'marks')::integer INTO qmarks FROM jsonb_array_elements(qs) q WHERE q->>'id'=p_question;
 IF qmarks IS NULL THEN RAISE EXCEPTION 'Question not found'; END IF;
 FOR a IN SELECT * FROM public.exam_attempts WHERE bank_id=p_bank AND round=p_round AND results_reset_at IS NULL AND NOT (p_question = ANY(bonus_questions)) AND (p_codes IS NULL OR student_code = ANY(p_codes)) FOR UPDATE LOOP
  bonus := array_append(a.bonus_questions, p_question);
  SELECT (a.answers->>p_question)::integer IS NOT DISTINCT FROM (q->>'answer')::integer INTO was_right FROM jsonb_array_elements(qs) q WHERE q->>'id'=p_question;
  IF NOT COALESCE(was_right,false) THEN gained := gained+1; END IF;
  UPDATE public.exam_attempts SET bonus_questions=bonus WHERE id=a.id;
  IF a.status <> 'in_progress' THEN
   SELECT COALESCE(sum(CASE WHEN (a.answers->>(q->>'id'))::integer = (q->>'answer')::integer OR (q->>'id') = ANY(bonus) THEN (q->>'marks')::integer ELSE 0 END),0), COALESCE(sum((q->>'marks')::integer),0) INTO earned,possible FROM jsonb_array_elements(qs) q;
   UPDATE public.exam_attempts SET score=earned,total=possible WHERE id=a.id;
   INSERT INTO public.round_results(round,student_code,subject,score_pct) VALUES(a.round,a.student_code,subj,CASE WHEN possible>0 THEN round(earned*100.0/possible) ELSE 0 END) ON CONFLICT(round,student_code,subject) DO UPDATE SET score_pct=EXCLUDED.score_pct,updated_at=now();
  END IF;
 END LOOP;
 RETURN gained;
END; $$;
REVOKE ALL ON FUNCTION public.award_question_marks(uuid,integer,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.award_question_marks(uuid,integer,text,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_visible_results(p_round integer,p_stream text) RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$ DECLARE n integer; BEGIN
 PERFORM id FROM public.exam_settings WHERE id=1 FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.exam_attempts a JOIN public.registered_students st USING(student_code) WHERE a.round=p_round AND st.stream=p_stream AND a.status='in_progress') THEN RAISE EXCEPTION 'Wait for active students to finish before resetting results'; END IF;
 UPDATE public.exam_attempts a SET results_reset_at=now() FROM public.registered_students st WHERE a.student_code=st.student_code AND a.round=p_round AND st.stream=p_stream AND a.results_reset_at IS NULL;
 DELETE FROM public.round_results r USING public.registered_students st WHERE r.student_code=st.student_code AND r.round=p_round AND st.stream=p_stream;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END; $$;
REVOKE ALL ON FUNCTION public.reset_visible_results(integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_visible_results(integer,text) TO service_role;

-- True when every admitted, verified student of each active stream has finished (submitted or blocked) this session's paper.
CREATE OR REPLACE FUNCTION public.exam_everyone_finished(s public.exam_settings) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT (s.active_bank_id IS NOT NULL OR s.social_bank_id IS NOT NULL) AND s.scheduled_start IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.exam_attempts WHERE round=s.current_round AND bank_id IN(s.active_bank_id,s.social_bank_id) AND started_at>=s.scheduled_start)
  AND NOT EXISTS(SELECT 1 FROM public.registered_students st JOIN public.question_banks b ON b.id IN(s.active_bank_id,s.social_bank_id) AND b.target_stream=st.stream
   WHERE st.face_verified AND (s.selected_student_codes IS NULL OR st.student_code=ANY(s.selected_student_codes))
   AND NOT EXISTS(SELECT 1 FROM public.exam_attempts a WHERE a.student_code=st.student_code AND a.round=s.current_round AND a.bank_id=b.id AND a.status<>'in_progress'))
$$;
REVOKE ALL ON FUNCTION public.exam_everyone_finished(public.exam_settings) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exam_everyone_finished(public.exam_settings) TO service_role;

-- Auto schedule: the closing time stops NEW starts only. Students still writing (extra time or paused)
-- keep the session open until they submit or their own time runs out; then the session closes by itself.
CREATE OR REPLACE FUNCTION public.apply_exam_schedule() RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s public.exam_settings; a public.exam_attempts; live boolean; done boolean; window_open boolean; still_writing boolean;
BEGIN
 SELECT * INTO s FROM public.exam_settings WHERE id=1 FOR UPDATE;
 -- Freeze silent devices first, then submit only attempts whose own time has run out (paused ones wait for the Director).
 PERFORM public.pause_disconnected_attempts(6);
 FOR a IN SELECT * FROM public.exam_attempts WHERE status='in_progress' AND paused_at IS NULL AND deadline_at<=now() LOOP
  PERFORM public.save_exam_submission(a.id,a.answers,'submitted',a.violations);
 END LOOP;
 done := s.auto_close AND public.exam_everyone_finished(s);
 IF NOT s.auto_schedule THEN
  -- Manual mode: the Director opens the session; it closes by itself once every admitted student has submitted.
  IF s.exam_live AND done THEN UPDATE public.exam_settings SET exam_live=false, auto_completed=true, updated_at=now() WHERE id=1; END IF;
  RETURN;
 END IF;
 window_open := (s.active_bank_id IS NOT NULL OR s.social_bank_id IS NOT NULL) AND s.scheduled_start IS NOT NULL AND s.scheduled_close IS NOT NULL AND now()>=s.scheduled_start AND now()<s.scheduled_close;
 still_writing := s.exam_live AND s.scheduled_start IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.exam_attempts WHERE round=s.current_round AND bank_id IN(s.active_bank_id,s.social_bank_id) AND status='in_progress' AND started_at>=s.scheduled_start);
 live := NOT(s.auto_completed OR done) AND (window_open OR still_writing);
 IF live IS DISTINCT FROM s.exam_live OR (done AND NOT s.auto_completed) THEN UPDATE public.exam_settings SET exam_live=live,auto_completed=auto_completed OR done,updated_at=now() WHERE id=1; END IF;
 IF NOT live AND (done OR s.auto_completed OR (s.scheduled_close IS NOT NULL AND now()>=s.scheduled_close)) THEN
  BEGIN PERFORM cron.unschedule('burka-harbu-auto-exams'); EXCEPTION WHEN OTHERS THEN NULL; END;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.apply_exam_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_exam_schedule() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE OR REPLACE FUNCTION public.arm_exam_schedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.auto_schedule AND NOT NEW.auto_completed AND (NEW.active_bank_id IS NOT NULL OR NEW.social_bank_id IS NOT NULL) AND NEW.scheduled_close>now() THEN
  PERFORM cron.schedule('burka-harbu-auto-exams','* * * * *','SELECT public.apply_exam_schedule()');
 ELSE
  BEGIN PERFORM cron.unschedule('burka-harbu-auto-exams'); EXCEPTION WHEN OTHERS THEN NULL; END;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.arm_exam_schedule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER arm_exam_schedule AFTER UPDATE OF auto_schedule,active_bank_id,scheduled_start,scheduled_close ON public.exam_settings FOR EACH ROW EXECUTE FUNCTION public.arm_exam_schedule();
CREATE TRIGGER arm_room_schedule AFTER UPDATE OF social_bank_id,selected_student_codes,auto_completed ON public.exam_settings FOR EACH ROW EXECUTE FUNCTION public.arm_exam_schedule();

CREATE TABLE public.telegram_users (
  chat_id bigint PRIMARY KEY,
  telegram_user_id bigint,
  username text,
  first_name text,
  last_name text,
  language_code text,
  entered_name text,
  student_code text,
  id_confirmed boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'await_name',
  state_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  pin_failures integer NOT NULL DEFAULT 0,
  pin_locked_until timestamptz,
  blocked boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_users_student_code_idx ON public.telegram_users (student_code);
GRANT ALL ON public.telegram_users TO service_role;
ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id bigint UNIQUE,
  chat_id bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  kind text NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','help','broadcast','notice','reply')),
  text text,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_messages_chat_idx ON public.telegram_messages (chat_id, created_at DESC);
CREATE INDEX telegram_messages_kind_idx ON public.telegram_messages (kind, created_at DESC);
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_enabled boolean NOT NULL DEFAULT true,
  results_enabled boolean NOT NULL DEFAULT true,
  notify_exam_live boolean NOT NULL DEFAULT true,
  notify_results boolean NOT NULL DEFAULT true,
  notify_registration boolean NOT NULL DEFAULT true,
  welcome_message text NOT NULL DEFAULT 'Welcome to the Burka Harbu Special Secondary School Grade 12 Exam Portal bot!',
  help_message text NOT NULL DEFAULT 'For help, contact the IT Admin at https://t.me/bhsss_admin or type your question below.',
  portal_url text NOT NULL DEFAULT 'https://ashacute.lovable.app',
  last_exam_live boolean,
  last_results_published boolean,
  last_registration_open boolean,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_settings TO service_role;
ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.telegram_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.telegram_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','auto')),
  audience text NOT NULL,
  message text NOT NULL,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_broadcasts TO service_role;
ALTER TABLE public.telegram_broadcasts ENABLE ROW LEVEL SECURITY;