-- Director reset now removes the round's finished attempts and subject summaries for the stream,
-- so the marks disappear everywhere (Director, student, teacher, Telegram) and the students can sit the exam again.
CREATE OR REPLACE FUNCTION public.reset_visible_results(p_round integer,p_stream text) RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$ DECLARE n integer; BEGIN
 PERFORM id FROM public.exam_settings WHERE id=1 FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.exam_attempts a JOIN public.registered_students st USING(student_code) WHERE a.round=p_round AND st.stream=p_stream AND a.status='in_progress') THEN RAISE EXCEPTION 'Wait for active students to finish before resetting results'; END IF;
 DELETE FROM public.exam_attempts a USING public.registered_students st WHERE a.student_code=st.student_code AND a.round=p_round AND st.stream=p_stream AND a.status<>'in_progress';
 GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM public.round_results r USING public.registered_students st WHERE r.student_code=st.student_code AND r.round=p_round AND st.stream=p_stream;
 RETURN n; END; $$;
REVOKE ALL ON FUNCTION public.reset_visible_results(integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_visible_results(integer,text) TO service_role;