ALTER TABLE public.exam_settings ADD COLUMN IF NOT EXISTS practice_mode boolean NOT NULL DEFAULT false;
ALTER TABLE public.exam_attempts ADD COLUMN IF NOT EXISTS practice boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.save_exam_submission(p_attempt uuid, p_answers jsonb, p_status text, p_violations integer) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a public.exam_attempts; qs jsonb; earned integer; possible integer; subj text;
BEGIN
 SELECT * INTO a FROM public.exam_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
 SELECT questions,subject INTO qs,subj FROM public.question_banks WHERE id=a.bank_id;
 IF a.status <> 'in_progress' THEN RETURN; END IF;
 SELECT COALESCE(sum(CASE WHEN (p_answers->>(q->>'id'))::integer = (q->>'answer')::integer OR (q->>'id') = ANY(a.bonus_questions) THEN (q->>'marks')::integer ELSE 0 END),0), COALESCE(sum((q->>'marks')::integer),0) INTO earned,possible FROM jsonb_array_elements(qs) q;
 UPDATE public.exam_attempts SET answers=p_answers,status=p_status,violations=p_violations,score=earned,total=possible,submitted_at=now(),paused_at=NULL,pause_reason=NULL WHERE id=p_attempt;
 IF a.practice THEN RETURN; END IF;
 INSERT INTO public.round_results(round,student_code,subject,score_pct) VALUES(a.round,a.student_code,subj,CASE WHEN possible>0 THEN round(earned*100.0/possible) ELSE 0 END) ON CONFLICT(round,student_code,subject) DO UPDATE SET score_pct=EXCLUDED.score_pct,updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.save_exam_submission(uuid,jsonb,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_submission(uuid,jsonb,text,integer) TO service_role;