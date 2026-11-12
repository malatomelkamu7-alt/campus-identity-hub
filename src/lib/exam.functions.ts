import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { teacherStream, canTakeStream, teacherCredentialKey, RESULT_PIN, hashResultPin, uploadSubjects } from "@/lib/admin-rules";
import { canStartExam, personalDeadline, remainingSeconds, DISCONNECT_GRACE_SEC, admittedToRoom, activeBankIds, HELP_COOLDOWN_SEC, helpMessage } from "@/lib/exam-timing";
import { normalizeName, requirePasscode, shouldBlock, shuffle, subjectsFor } from "@/lib/identity";
import { FIGURE_PATH, MAX_OPTION, MAX_PASSAGE, MAX_TEXT, MAX_PAPER_PAGES, groupByPassage } from "@/lib/paper";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** `passage` is a shared reading text shown with the question; `figure` is the storage path of its picture. */
export type Question = { id: string; text: string; options: [string, string, string, string]; answer: number; marks: number; passage?: string | undefined; figure?: string | undefined };
const opt = z.string().max(MAX_OPTION);
const questionSchema = z.object({
  id: z.string().min(1).max(60), text: z.string().trim().min(1).max(MAX_TEXT),
  options: z.tuple([opt, opt, opt, opt]),
  answer: z.number().int().min(0).max(3), marks: z.number().int().min(1).max(10),
  passage: z.string().trim().max(MAX_PASSAGE).optional().transform((v) => v || undefined),
  figure: z.string().regex(FIGURE_PATH).optional(),
});
const FIGURE_BUCKET = "question-figures";
/** Short-lived links to question pictures in private storage. */
async function figureLinks(paths: (string | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (!unique.length) return {} as Record<string, string>;
  const sb = await admin();
  const { data } = await sb.storage.from(FIGURE_BUCKET).createSignedUrls(unique, 8 * 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}
const pass = z.string().min(1).max(200);
const now = () => new Date().toISOString();

async function settings() {
  const sb = await admin();
  const { error: scheduleError } = await sb.rpc("apply_exam_schedule");
  if (scheduleError) throw new Error("Could not check the automatic exam schedule.");
  const { data, error } = await sb.from("exam_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Could not load exam settings.");
  return data;
}
const secondsLeft = remainingSeconds;

async function settleAttempts(force = false) {
  const sb = await admin();
  if (!force) {
    const { error: pauseError } = await sb.rpc("pause_disconnected_attempts", { p_grace_sec: DISCONNECT_GRACE_SEC });
    if (pauseError) throw new Error("Could not check student connections.");
  }
  let query = sb.from("exam_attempts").select("*").eq("status", "in_progress");
  if (!force) query = query.lte("deadline_at", now()).is("paused_at", null);
  const { data, error } = await query;
  if (error) throw new Error("Could not check exam submissions.");
  for (const a of data ?? []) {
    const { error: saveError } = await sb.rpc("save_exam_submission", { p_attempt: a.id, p_answers: a.answers, p_status: "submitted", p_violations: a.violations });
    if (saveError) throw new Error("Could not save completed exam marks.");
  }
}


/* Staff passwords: a reset/changed password lives in staff_credentials and
   wins over the environment password, so changes take effect immediately. */
type StaffRole = "director" | "teacher";
async function staffPasscode(role: StaffRole, teacherId?: string): Promise<string | undefined> {
  const sb = await admin();
  if (role === "teacher" && teacherId) {
    const own = await sb.from("staff_credentials").select("passcode").eq("role", teacherCredentialKey(teacherId)).maybeSingle();
    if (own.data) return own.data.passcode;
  }
  const { data } = await sb.from("staff_credentials").select("passcode").eq("role", role).maybeSingle();
  return data?.passcode ?? (role === "director" ? process.env["DIRECTOR_PASSCODE"] : process.env["TEACHER_PASSCODE"]);
}

export const adminResetStaffPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, role: z.enum(["director", "teacher"]), teacherId: z.string().min(3).max(40).optional() }).parse(d))
  .handler(async ({ data }) => {
    requirePasscode(data.passcode, process.env["IT_ADMIN_PASSCODE"], "IT Admin");
    const sb = await admin();
    const code = `BH-${data.role === "director" ? "DIR" : "TCH"}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (data.role === "teacher") {
      if (!data.teacherId) throw new Error("Choose the teacher whose password should be reset.");
      const { data: t } = await sb.from("school_roster").select("id").eq("id", data.teacherId).eq("kind", "teacher").maybeSingle();
      if (!t) throw new Error("That teacher was not found.");
    }
    const key = data.role === "teacher" ? teacherCredentialKey(data.teacherId ?? "") : data.role;
    const { error } = await sb.from("staff_credentials").upsert({ role: key, passcode: code, updated_at: now() });
    if (error) throw new Error("Could not reset the password.");
    return { code };
  });

/* ---------------- Public state (polled by every screen) ---------------- */
export const getPublicState = createServerFn({ method: "GET" }).handler(async () => {
  await settleAttempts();
  const s = await settings();
  // Tells Telegram bot users when the exam goes live, results are published or registration opens (once per change).
  const { notifyStatusChanges } = await import("@/lib/telegram.server");
  await notifyStatusChanges().catch((e) => console.error("Telegram notice failed", e));
  const sb = await admin();
  let bank: { id: string; title: string; subject: string; count: number; marks: number; stream: string | null } | null = null;
  if (s.active_bank_id) {
    const { data } = await sb.from("question_banks").select("id,title,subject,questions,target_stream").eq("id", s.active_bank_id).maybeSingle();
    if (data) {
      const qs = data.questions as Question[];
      bank = { stream: data.target_stream, id: data.id, title: data.title, subject: data.subject, count: qs.length, marks: qs.reduce((a, q) => a + q.marks, 0) };
    }
  }
  const { data: social } = s.social_bank_id ? await sb.from("question_banks").select("id,title,subject,questions,target_stream").eq("id", s.social_bank_id).maybeSingle() : { data: null };
  const banks = [bank, social ? { id: social.id, title: social.title, subject: social.subject, stream: social.target_stream, count: (social.questions as Question[]).length, marks: (social.questions as Question[]).reduce((n,q) => n + q.marks,0) } : null].filter((b) => b !== null);
  return {
    hiddenStaffRoles: s.hidden_staff_roles, banks,
    examLive: s.exam_live, resultsPublished: s.results_published, registrationOpen: s.registration_open, satEnabled: s.sat_enabled,
    round: s.current_round, clockRunning: canStartExam(s.exam_live, s.scheduled_start, s.scheduled_close), secondsLeft: 0, durationMin: (s.duration_sec + s.extension_sec) / 60, scheduledStart: s.scheduled_start, scheduledClose: s.scheduled_close, bank,
  };
});

/* ---------------- Director ---------------- */
// With Auto close on, the Director only opens the session; it closes itself after every admitted student submits.
const AUTO_CLOSE_ONLY = "Auto close is on, so the exam closes by itself after every admitted student submits. To close it yourself, turn Auto close off in Settings first.";
async function dir(p: string) {
  requirePasscode(p, await staffPasscode("director"), "Director");
}

export const directorChangePassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ current: pass, next: z.string().min(4).max(100) }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.current);
    const sb = await admin();
    const { error } = await sb.from("staff_credentials").upsert({ role: "director", passcode: data.next, updated_at: now() });
    if (error) throw new Error("Could not change the password.");
    return { ok: true };
  });

export const directorDashboard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, round: z.number().int().min(1).optional() }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const s = await settings();
    await settleAttempts();
    const { data: hidden } = await sb.from("exam_rounds").select("round").not("archived_at", "is", null);
    const archived = new Set((hidden ?? []).map(r => r.round));
    const round = data.round && !archived.has(data.round) ? data.round : s.current_round;
    const [banks, students, attempts, events, results] = await Promise.all([
      sb.from("question_banks").select("id,title,subject,status,teacher_id,questions,updated_at,target_stream").eq("status", "queued").order("updated_at", { ascending: false }),
      sb.from("registered_students").select("student_code,full_name,section,stream,gender,face_verified").order("student_code"),
      sb.from("exam_attempts").select("id,student_code,status,violations,score,total,bank_id,started_at,submitted_at,deadline_at,paused_at,pause_reason,last_seen_at,current_question,bonus_questions").eq("round", s.current_round).in("bank_id", activeBankIds(s)).gte("started_at", s.scheduled_start ?? now()).lt("started_at", s.scheduled_close ?? now()),
      sb.from("exam_events").select("*").is("dismissed_at", null).eq("round", s.current_round).gte("created_at", s.scheduled_start ?? now()).order("created_at", { ascending: false }).limit(60),
      sb.from("round_results").select("*").eq("round", round),
    ]);
    const { data: rounds } = await sb.from("round_results").select("round");
    const { data: flagRows } = await sb.from("exam_events").select("bank_id,question_id,student_code").eq("kind", "flag").eq("round", s.current_round);
    const flagCounts: Record<string, number> = {};
    for (const key of new Set((flagRows ?? []).map((f) => `${f.bank_id}|${f.question_id}|${f.student_code}`))) {
      const k = key.split("|").slice(0, 2).join("|"); flagCounts[k] = (flagCounts[k] ?? 0) + 1;
    }
    return {
      settings: { autoClose: s.auto_close, autoCompleted: s.auto_completed, autoSchedule: s.auto_schedule, examLive: s.exam_live, resultsPublished: s.results_published, satEnabled: s.sat_enabled, round: s.current_round, activeBankId: s.active_bank_id, socialBankId: s.social_bank_id, selectedStudentCodes: s.selected_student_codes, durationMin: Math.round(s.duration_sec / 60), extensionMin: s.extension_sec / 60, scheduledStart: s.scheduled_start, scheduledClose: s.scheduled_close, secondsLeft: 0, clockRunning: s.exam_live },
      banks: (banks.data ?? []).map((b) => ({ id: b.id, title: b.title, subject: b.subject, teacherId: b.teacher_id, stream: b.target_stream, count: (b.questions as Question[]).length })),
      students: students.data ?? [],
      participationStudents: s.exam_live && s.scheduled_start && s.scheduled_close ? (students.data ?? []).filter(st => st.face_verified && admittedToRoom(st.student_code, s.selected_student_codes) && (banks.data ?? []).some(b => activeBankIds(s).includes(b.id) && canTakeStream(st.stream, b.target_stream))) : [], attempts: s.exam_live ? attempts.data ?? [] : [], events: events.data ?? [], results: results.data ?? [],
      viewRound: round, flagCounts,
      rounds: [...new Set([s.current_round, ...(rounds ?? []).map((r) => r.round)])].filter(r => !archived.has(r)).sort((a, b) => a - b),
    };
  });

export const directorUpdate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    passcode: pass,
    autoSchedule: z.boolean().optional(), examLive: z.boolean().optional(), resultsPublished: z.boolean().optional(), satEnabled: z.boolean().optional(), autoClose: z.boolean().optional(),
    clearStream: z.enum(["Natural Science", "Social Science"]).optional(),
    activeBankId: z.string().uuid().nullable().optional(), selectedStudentCodes: z.array(z.string().min(3).max(30)).max(2000).nullable().optional(), durationMin: z.number().int().min(5).max(600).optional(),
    scheduledStart: z.string().datetime().optional(), scheduledClose: z.string().datetime().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const s = await settings();
    if (s.auto_schedule && data.examLive !== undefined) throw new Error("Turn Auto off before manually opening or closing the exam.");
    if (data.examLive === false && s.exam_live && s.auto_close) throw new Error(AUTO_CLOSE_ONLY);
    if (data.autoSchedule && (!activeBankIds(s).length || !s.scheduled_start || !s.scheduled_close || Date.parse(s.scheduled_close) <= Date.now())) throw new Error("Choose a paper and save a future schedule before enabling Auto.");
    let chosenStream: string | null = null;
    if (data.activeBankId) {
      const { data: chosen } = await sb.from("question_banks").select("target_stream,status").eq("id", data.activeBankId).single();
      if (!chosen || chosen.status !== "queued" || !chosen.target_stream) throw new Error("Choose a queued paper with a stream.");
      chosenStream = chosen.target_stream;
    }
    const changingPaper = data.activeBankId !== undefined || data.clearStream !== undefined;
    if (s.exam_live && (changingPaper || data.durationMin !== undefined || data.scheduledStart !== undefined || data.scheduledClose !== undefined)) throw new Error("Close the session before changing the paper or schedule. Use Add minutes for active exams.");
    const start = data.scheduledStart ?? s.scheduled_start;
    const close = data.scheduledClose ?? s.scheduled_close;
    if ((data.scheduledStart || data.scheduledClose) && (!start || !close || Date.parse(close) <= Date.parse(start))) throw new Error("The last start time must be after the opening time.");
    if (data.examLive && (!activeBankIds(s).length || !start || !close || Date.parse(close) <= Date.now())) throw new Error("Choose a paper and a valid exam schedule first.");
    const patch: import("@/integrations/supabase/types").TablesUpdate<"exam_settings"> = { updated_at: now() };
    if (data.autoSchedule !== undefined) patch.auto_schedule = data.autoSchedule;
    if (data.examLive !== undefined) { patch.exam_live = data.examLive; if (data.examLive) patch.auto_completed = false; else await settleAttempts(true); }
    if (data.autoClose !== undefined) patch.auto_close = data.autoClose;
    if (data.clearStream) { if (data.clearStream === "Social Science") patch.social_bank_id = null; else patch.active_bank_id = null; patch.auto_completed = false; }
    if (data.resultsPublished !== undefined) patch.results_published = data.resultsPublished;
    if (data.satEnabled !== undefined) patch.sat_enabled = data.satEnabled;
    if (data.activeBankId !== undefined) { if (chosenStream === "Social Science") patch.social_bank_id = data.activeBankId; else patch.active_bank_id = data.activeBankId; patch.extension_sec = 0; patch.auto_completed = false; }
    if (data.selectedStudentCodes !== undefined) {
      const { data: enrolled } = await sb.from("registered_students").select("student_code").eq("face_verified",true);
      if (data.selectedStudentCodes?.some(c => !(enrolled ?? []).some(st => st.student_code === c))) throw new Error("Choose verified students from the list.");
      patch.selected_student_codes = data.selectedStudentCodes; patch.auto_completed = false;
    }
    if (data.scheduledStart !== undefined || data.scheduledClose !== undefined) patch.auto_completed = false;
    if (data.durationMin !== undefined) patch.duration_sec = data.durationMin * 60;
    if (data.scheduledStart !== undefined) patch.scheduled_start = data.scheduledStart;
    if (data.scheduledClose !== undefined) patch.scheduled_close = data.scheduledClose;
    const { error } = await sb.from("exam_settings").update(patch).eq("id", 1);
    if (error) throw new Error("Could not save the change.");
    return { ok: true };
  });

export const directorClock = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, action: z.enum(["start", "stop", "extend"]), minutes: z.number().int().min(1).max(180).optional() }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const s = await settings();
    if (s.auto_schedule && data.action !== "extend") throw new Error("Turn Auto off before manual exam control.");
    if (data.action === "stop" && s.exam_live && s.auto_close) throw new Error(AUTO_CLOSE_ONLY);
    if (data.action === "extend") {
      if (!s.exam_live) throw new Error("Open the session before adding minutes.");
      await settleAttempts();
      const { error } = await sb.rpc("extend_exam_minutes", { p_minutes: data.minutes ?? 5 });
      if (error) throw new Error("Could not add minutes.");
    } else {
      if (data.action === "start" && (!activeBankIds(s).length || !s.scheduled_start || !s.scheduled_close || Date.parse(s.scheduled_close) <= Date.now())) throw new Error("Set the exam schedule first.");
      if (data.action === "stop") await settleAttempts(true);
      const { error } = await sb.from("exam_settings").update({ exam_live: data.action === "start", ...(data.action === "start" ? { auto_completed: false } : {}), updated_at: now() }).eq("id", 1);
      if (error) throw new Error("Could not update the session.");
    }
    return { ok: true };
  });

export const directorNewRound = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const s = await settings();
    await settleAttempts(true);
    // Earlier rounds and results stay untouched.
    const { error } = await sb.from("exam_settings").update({ current_round: s.current_round + 1, auto_completed: false, selected_student_codes: null, auto_schedule: false, ends_at: null, scheduled_start: null, scheduled_close: null, extension_sec: 0, exam_live: false, updated_at: now() }).eq("id", 1);
    if (error) throw new Error("Could not start a new round.");
    await sb.from("exam_rounds").upsert({ round: s.current_round + 1, archived_at: null });
    return { round: s.current_round + 1 };
  });

export const directorReadmit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, studentCode: z.string().min(3).max(30) }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const s = await settings();
    if (!activeBankIds(s).length) throw new Error("No active exam.");
    const { error } = await sb.from("exam_attempts").update({ status: "in_progress", violations: 0, submitted_at: null, paused_at: null, pause_reason: null, last_seen_at: now(), deadline_at: personalDeadline(now(), s.duration_sec, s.extension_sec) })
      .eq("round", s.current_round).in("bank_id", activeBankIds(s)).eq("student_code", data.studentCode).eq("status", "blocked");
    if (error) throw new Error("Could not re-admit this student.");
    await sb.from("exam_events").insert({ kind: "readmit", student_code: data.studentCode, round: s.current_round, message: "Re-admitted by the Director" });
    return { ok: true };
  });

/* ---------------- Teacher ---------------- */
async function teacher(passcode: string, teacherId: string) {
  requirePasscode(passcode, await staffPasscode("teacher", teacherId), "Teacher");
  const sb = await admin();
  const { data } = await sb.from("school_roster").select("id,full_name,subjects,stream").eq("id", teacherId).eq("kind", "teacher").maybeSingle();
  if (!data) throw new Error("Teacher not found.");
  return { ...data, subjects: uploadSubjects(data.subjects) };
}

export const listTeachers = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data } = await sb.from("school_roster").select("id,full_name,stream,subjects").eq("kind", "teacher").order("id");
  return (data ?? []).map((t) => ({ ...t, subjects: uploadSubjects(t.subjects) }));
});

export const teacherDashboard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: z.string().max(30) }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const sb = await admin();
    const [banks, flags] = await Promise.all([
      sb.from("question_banks").select("*").eq("teacher_id", t.id).neq("status", "archived").order("updated_at", { ascending: false }),
      sb.from("exam_events").select("*").eq("kind", "flag").eq("teacher_id", t.id).is("teacher_dismissed_at", null).order("created_at", { ascending: false }).limit(50),
    ]);
    return { teacher: t, banks: (banks.data ?? []).map((b) => ({ ...b, questions: b.questions as Question[] })), flags: flags.data ?? [] };
  });

export const teacherSaveBank = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    passcode: pass, teacherId: z.string().max(30), id: z.string().uuid().optional(),
    subject: z.string().min(1).max(40), title: z.string().trim().min(1).max(120), status: z.enum(["draft", "queued"]),
    questions: z.array(questionSchema).max(300),
  }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    if (!t.subjects.includes(data.subject)) throw new Error("You can only upload questions for your own subject.");
    const sb = await admin();
    const row = { target_stream: teacherStream(t.stream, t.id), subject: data.subject, title: data.title, status: data.status, questions: data.questions, teacher_id: t.id, updated_at: now() };
    const res = data.id
      ? await sb.from("question_banks").update(row).eq("id", data.id).eq("teacher_id", t.id).select("id").single()
      : await sb.from("question_banks").insert(row).select("id").single();
    if (res.error) throw new Error("Could not save the question bank.");
    return { id: res.data.id };
  });

const b64 = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9+/=]+$/);
export const teacherScanPaper = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    passcode: pass, teacherId: z.string().max(30),
    fileName: z.string().trim().min(1).max(200),
    subject: z.string().max(40).optional(),
    pages: z.array(b64(4_000_000)).min(1).max(MAX_PAPER_PAGES).optional(),
    text: z.string().trim().min(1).max(300_000).optional(),
    figures: z.array(b64(3_000_000)).max(40).optional(),
  }).refine((d) => !!d.pages !== !!d.text, "Send the page pictures or the text.").parse(d))
  .handler(async ({ data }) => {
    await teacher(data.passcode, data.teacherId);
    const { scanPaper } = await import("@/lib/paper.server");
    const questions = await scanPaper(data);
    if (!questions.length) throw new Error("No multiple-choice questions were found in this paper. Check that each question has its choices (A, B, C, D).");
    return { questions };
  });

/** Saves one question picture (JPEG) into the teacher's private folder. */
export const teacherUploadFigure = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: z.string().max(30), base64: b64(4_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("The picture must be a JPEG.");
    const path = `${t.id}/${crypto.randomUUID()}.jpg`;
    const sb = await admin();
    const { error } = await sb.storage.from(FIGURE_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error("Could not save the picture. Please try again.");
    return { path, url: (await figureLinks([path]))[path] ?? "" };
  });

/** Links for the pictures in a teacher's own banks. */
export const teacherFigureUrls = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: z.string().max(30), paths: z.array(z.string().regex(FIGURE_PATH)).max(600) }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    return figureLinks(data.paths.filter((p) => p.startsWith(`${t.id}/`)));
  });

/* ---------------- Student exam ---------------- */
async function student(who: { name: string; id: string; token: string }) {
  const sb = await admin();
  const { data } = await sb.from("registered_students").select("id,student_code,full_name,stream,grade,section,face_verified,session_token").eq("student_code", who.id.toUpperCase()).maybeSingle();
  if (!data || normalizeName(data.full_name) !== normalizeName(who.name)) throw new Error("Please sign in again.");
  if (!data.face_verified) throw new Error("Your face verification was reset. Please register again.");
  if (data.session_token !== who.token) throw new Error("You were signed in on another device. Please sign in again.");
  await sb.from("registered_students").update({ session_seen_at: now() }).eq("id", data.id);
  return data;
}
const who = z.object({ name: z.string().min(1).max(100), id: z.string().min(3).max(30), token: z.string().uuid() });
const attemptLeft = (a: { deadline_at: string | null; paused_at: string | null }) => secondsLeft(a.deadline_at, a.paused_at ? Date.parse(a.paused_at) : undefined);

async function activeContext(stream: string) {
  const s = await settings();
  const ids = activeBankIds(s);
  if (!ids.length) throw new Error("No exam is scheduled.");
  const sb = await admin();
  const { data: bank } = await sb.from("question_banks").select("*").in("id", ids).eq("target_stream", stream).single();
  if (!bank) throw new Error("No exam is scheduled.");
  return { s, bank: { ...bank, questions: bank.questions as Question[] } };
}

async function finalize(attemptId: string, answers: Record<string, number>, status: "submitted" | "blocked", violations: number) {
  const sb = await admin();
  const { error } = await sb.rpc("save_exam_submission", { p_attempt: attemptId, p_answers: answers, p_status: status, p_violations: violations });
  if (error) throw new Error("Your submission could not be saved. Please retry.");
}

export const studentExam = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const { s, bank } = await activeContext(st.stream);
    if (!canTakeStream(st.stream, bank.target_stream)) throw new Error("This exam is not for your stream.");
    const sb = await admin();
    let { data: att } = await sb.from("exam_attempts").select("*").eq("round", s.current_round).eq("bank_id", bank.id).eq("student_code", st.student_code).maybeSingle();
    if (!canTakeStream(st.stream, bank.target_stream)) throw new Error("This exam is not for your stream.");
    if (!att) {
      if (!admittedToRoom(st.student_code, s.selected_student_codes)) throw new Error("You are not selected for this exam room. Wait for the Director to admit your group.");
      if (!canStartExam(s.exam_live, s.scheduled_start, s.scheduled_close)) throw new Error("The exam is not open right now.");
      const ins = await sb.from("exam_attempts").insert({ round: s.current_round, bank_id: bank.id, student_code: st.student_code, deadline_at: personalDeadline(now(), s.duration_sec, s.extension_sec), last_seen_at: now() }).select("*").single();
      if (ins.error) {
        if (ins.error.code !== "23505") throw new Error("Could not start the exam.");
        const existing = await sb.from("exam_attempts").select("*").eq("round", s.current_round).eq("bank_id", bank.id).eq("student_code", st.student_code).single();
        if (existing.error || !existing.data) throw new Error("Could not resume the exam.");
        att = existing.data;
      } else att = ins.data;
      await sb.from("exam_events").insert({ kind: "start", student_code: st.student_code, round: s.current_round, message: `Started ${bank.title}` });
    }
    if (att.status === "in_progress") await sb.from("exam_attempts").update({ last_seen_at: now() }).eq("id", att.id);
    const left = attemptLeft(att);
    if (att.status === "in_progress" && !att.paused_at && (!s.exam_live || left <= 0)) {
      await finalize(att.id, att.answers as Record<string, number>, "submitted", att.violations);
      att.status = "submitted";
    }
    // Questions sharing a reading passage stay together and in order; everything else is shuffled per student.
    const ordered = shuffle(groupByPassage(bank.questions), st.student_code + bank.id + s.current_round).flat();
    const links = await figureLinks(ordered.map((q) => q.figure));
    const paper = ordered.map((q) => ({
      id: q.id, text: q.text, marks: q.marks, passage: q.passage ?? null, figureUrl: q.figure ? links[q.figure] ?? null : null,
      choices: shuffle([0, 1, 2, 3], st.student_code + q.id + s.current_round).map((orig) => ({ value: orig, label: q.options[orig] })),
    }));
    return { attemptId: att.id, currentQuestion: att.current_question, pauseReason: att.pause_reason, paused: !!att.paused_at && att.status === "in_progress", attemptStatus: att.status, answers: att.answers as Record<string, number>, violations: att.violations, secondsLeft: left, examLive: s.exam_live, title: bank.title, subject: bank.subject, paper };
  });

export const studentSync = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.extend({
    answers: z.record(z.string().max(60), z.number().int().min(0).max(3)),
    violation: z.enum(["fullscreen", "focus"]).optional(), submit: z.boolean().optional(), connectionLost: z.boolean().optional(), current: z.number().int().min(0).max(1000).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const { s, bank } = await activeContext(st.stream);
    if (!canTakeStream(st.stream, bank.target_stream)) throw new Error("This exam is not for your stream.");
    const sb = await admin();
    const { data: att } = await sb.from("exam_attempts").select("*").eq("round", s.current_round).eq("bank_id", bank.id).eq("student_code", st.student_code).maybeSingle();
    if (!att) throw new Error("Exam not started.");
    const left = attemptLeft(att);
    const paused = !!att.paused_at;
    if (att.status !== "in_progress") return { pauseReason: null, paused: false, status: att.status, violations: att.violations, secondsLeft: left, examLive: s.exam_live, timeUp: false };
    let violations = att.violations;
    if (data.violation && !paused) {
      violations += 1;
      await sb.from("exam_events").insert({ kind: "violation", student_code: st.student_code, round: s.current_round, message: `${st.full_name} ${data.violation === "fullscreen" ? "left fullscreen" : "switched away from the exam"} (${violations})` });
    }
    if (data.connectionLost && !paused) {
      // The timer stops at the last moment the device was in contact, so no time is lost while it was offline.
      const frozenAt = att.last_seen_at ?? now();
      await sb.from("exam_attempts").update({ answers: data.answers, current_question: data.current ?? att.current_question, paused_at: frozenAt, pause_reason: "connection", last_seen_at: now() }).eq("id",att.id).eq("status","in_progress");
      await sb.from("exam_events").insert({ kind: "connection", student_code: st.student_code, round: s.current_round, message: `${st.full_name} lost connection or power — timer frozen, answers saved` });
      return { pauseReason: "connection", paused: true, status: "in_progress", violations, secondsLeft: secondsLeft(att.deadline_at, Date.parse(frozenAt)), examLive: s.exam_live, timeUp: false };
    }
    const timeUp = !paused && (left <= 0 || !s.exam_live);
    if (shouldBlock(violations)) {
      await finalize(att.id, data.answers, "blocked", violations);
      await sb.from("exam_events").insert({ kind: "blocked", student_code: st.student_code, round: s.current_round, message: `${st.full_name} was auto-submitted and blocked after ${violations} violations` });
      return { pauseReason: null, paused: false, status: "blocked", violations, secondsLeft: left, examLive: s.exam_live, timeUp: false };
    }
    if ((!paused && data.submit) || timeUp) {
      await finalize(att.id, data.answers, "submitted", violations);
      return { pauseReason: null, paused: false, status: "submitted", violations, secondsLeft: left, examLive: s.exam_live, timeUp };
    }
    const { error: saveError } = await sb.from("exam_attempts").update({ answers: data.answers, violations, last_seen_at: now(), ...(data.current !== undefined ? { current_question: data.current } : {}) }).eq("id", att.id).eq("status", "in_progress");
    if (saveError) throw new Error("Could not save answers. Please retry.");
    return { pauseReason: att.pause_reason, paused, status: "in_progress", violations, secondsLeft: left, examLive: s.exam_live, timeUp: false };
  });

export const studentFlag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.extend({ questionId: z.string().max(60), note: z.string().max(300).optional() }).parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const { s, bank } = await activeContext(st.stream);
    const q = bank.questions.find((x) => x.id === data.questionId);
    if (!q) throw new Error("Question not found.");
    const sb = await admin();
    await sb.from("exam_events").insert({
      kind: "flag", student_code: st.student_code, round: s.current_round, teacher_id: bank.teacher_id, bank_id: bank.id, question_id: q.id,
      message: `${bank.subject} · "${q.text.slice(0, 80)}" flagged${data.note ? `: ${data.note}` : ""}`,
    });
    return { ok: true };
  });

/** One tap on the exam's Help button tells the Director who needs help and where they are. */
export const studentHelp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.extend({ question: z.number().int().min(1).max(1000).optional() }).parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const { s, bank } = await activeContext(st.stream);
    const sb = await admin();
    const { data: att } = await sb.from("exam_attempts").select("id,status").eq("round", s.current_round).eq("bank_id", bank.id).eq("student_code", st.student_code).maybeSingle();
    if (!att || att.status !== "in_progress") throw new Error("Help can only be asked during your exam.");
    // Repeated taps within a short time count as one request.
    const since = new Date(Date.now() - HELP_COOLDOWN_SEC * 1000).toISOString();
    const { data: recent } = await sb.from("exam_events").select("id").eq("kind", "help").eq("student_code", st.student_code).is("dismissed_at", null).gte("created_at", since).limit(1);
    if (recent?.length) return { ok: true, repeated: true };
    const { error } = await sb.from("exam_events").insert({ kind: "help", student_code: st.student_code, round: s.current_round, bank_id: bank.id, message: helpMessage({ name: st.full_name, code: st.student_code, grade: st.grade, section: st.section, stream: st.stream, subject: bank.subject, question: data.question }) });
    if (error) throw new Error("Could not send your help request. Raise your hand.");
    return { ok: true, repeated: false };
  });

export const studentResults = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.extend({ round: z.number().int().min(1).optional(), pin: z.string().max(10).optional() }).parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const s = await settings();
    if (!s.results_published) return { published: false as const };
    const sb = await admin();
    // Results open only with the student's own numeric passcode. Students registered before passcodes existed set one here once.
    const { data: pinRow } = await sb.from("registered_students").select("results_pin_hash").eq("id", st.id).single();
    const stored = pinRow?.results_pin_hash ?? null;
    if (!data.pin) return { published: true as const, locked: stored ? "enter" as const : "create" as const };
    if (!RESULT_PIN.test(data.pin)) throw new Error("Your result passcode must be 4 to 6 numbers.");
    const hashed = await hashResultPin(st.student_code, data.pin);
    if (!stored) {
      const { data: saved, error } = await sb.from("registered_students").update({ results_pin_hash: hashed }).eq("id",st.id).is("results_pin_hash",null).select("id").maybeSingle();
      if (error || !saved) throw new Error("Your passcode changed. Please enter it again.");
    }
    else if (stored !== hashed) throw new Error("Wrong result passcode. Please try again.");
    await settleAttempts();
    const { data: hidden } = await sb.from("exam_rounds").select("round").not("archived_at", "is", null);
    const archived = new Set((hidden ?? []).map(r => r.round));
    const { data: allRows } = await sb.from("round_results").select("round,subject,score_pct").eq("student_code", st.student_code);
    const all = (allRows ?? []).filter(r => !archived.has(r.round));
    const rounds = [...new Set([s.current_round, ...(all ?? []).map((r) => r.round)])].sort((a, b) => a - b);
    const round = data.round ?? rounds[rounds.length - 1] ?? s.current_round;
    const scores = Object.fromEntries((all ?? []).filter((r) => r.round === round).map((r) => [r.subject, r.score_pct]));
    return { published: true as const, locked: null, rounds, round, subjects: subjectsFor(st.stream, s.sat_enabled || "SAT" in scores), scores };
  });

export const directorRemove = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, alertId: z.string().uuid().optional(), round: z.number().int().min(1).optional(), allAlerts: z.literal(true).optional() }).refine(d => [!!d.alertId, !!d.round, !!d.allAlerts].filter(Boolean).length === 1, "Choose an alert or round.").parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    if (data.allAlerts) {
      // Clears the whole alert feed for the current round; records are dismissed, not deleted, so marks and flag awards stay intact.
      const s = await settings();
      const { error } = await sb.from("exam_events").update({ dismissed_at: now() }).is("dismissed_at", null).eq("round", s.current_round);
      if (error) throw new Error("Could not remove the alerts.");
    } else if (data.alertId) {
      const { error } = await sb.from("exam_events").update({ dismissed_at: now() }).eq("id", data.alertId);
      if (error) throw new Error("Could not remove the alert.");
    } else if (data.round) {
      const s = await settings();
      if (data.round === s.current_round) throw new Error("Start a new round before removing the current round.");
      const { error } = await sb.from("exam_rounds").upsert({ round: data.round, archived_at: now() });
      if (error) throw new Error("Could not remove the round.");
    }
    return { ok: true };
  });

/** Clears the subject scores shown in the results matrix for one round and stream (shown as "—"). Exam attempts stay as they are. */
export const directorResetResults = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, round: z.number().int().min(1), stream: z.enum(["Natural Science", "Social Science"]) }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const { data: cleared, error } = await sb.rpc("reset_visible_results", { p_round: data.round, p_stream: data.stream });
    if (error) throw new Error("Wait for active students to finish before resetting their results.");
    return { cleared: cleared ?? 0 };
  });

export const directorRemoveBank = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const s = await settings();
    if (activeBankIds(s).includes(data.id) && s.exam_live) throw new Error("Close the exam before removing its paper.");
    if (activeBankIds(s).includes(data.id)) {
      const { error } = await sb.from("exam_settings").update({ ...(s.social_bank_id === data.id ? { social_bank_id: null } : { active_bank_id: null }), auto_schedule: false }).eq("id", 1);
      if (error) throw new Error("Could not clear the active paper.");
    }
    const { error } = await sb.from("question_banks").update({ status: "draft" }).eq("id", data.id);
    if (error) throw new Error("Could not remove the queued exam.");
    return { ok: true };
  });

export const directorStudentTime = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, attemptId: z.string().uuid(), action: z.enum(["extend", "pause", "resume"]), minutes: z.number().int().min(1).max(180).optional() }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const s = await settings();
    const { data: att } = await sb.from("exam_attempts").select("id,student_code").eq("id", data.attemptId).eq("round", s.current_round).in("bank_id", activeBankIds(s)).maybeSingle();
    if (!att) throw new Error("This student is not in the current exam.");
    const { error } = await sb.rpc("director_attempt_time", { p_attempt: att.id, p_action: data.action, p_minutes: data.minutes ?? 5 });
    if (error) throw new Error(data.action === "pause" ? "Could not pause — the student's exam may have ended." : "Could not change this student's time.");
    const msg = data.action === "extend" ? `Director added ${data.minutes ?? 5} minutes` : data.action === "pause" ? "Director paused the timer" : "Director resumed the timer";
    await sb.from("exam_events").insert({ kind: "readmit", student_code: att.student_code, round: s.current_round, message: msg });
    return { ok: true };
  });

export const teacherChangePassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ teacherId: z.string().max(30), current: pass, next: z.string().min(4).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.current, data.teacherId);
    const sb = await admin();
    const { error } = await sb.from("staff_credentials").upsert({ role: teacherCredentialKey(t.id), passcode: data.next, updated_at: now() });
    if (error) throw new Error("Could not change the password.");
    return { ok: true };
  });

export const teacherRemoveBank = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: z.string().max(30), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const sb = await admin();
    const s = await settings();
    if (activeBankIds(s).includes(data.id) && s.exam_live) throw new Error("This paper is live right now and cannot be removed.");
    if (activeBankIds(s).includes(data.id)) await sb.from("exam_settings").update({ ...(s.social_bank_id === data.id ? { social_bank_id: null } : { active_bank_id: null }), auto_schedule: false }).eq("id", 1);
    // Archived, not deleted: saved student marks still reference the paper.
    const { error, data: row } = await sb.from("question_banks").update({ status: "archived", updated_at: now() }).eq("id", data.id).eq("teacher_id", t.id).select("id").maybeSingle();
    if (error || !row) throw new Error("Could not remove the question bank.");
    return { ok: true };
  });

export const teacherRemoveFlag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: z.string().max(30), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const sb = await admin();
    const { error } = await sb.from("exam_events").update({ teacher_dismissed_at: now() }).eq("id", data.id).eq("teacher_id", t.id).eq("kind", "flag");
    if (error) throw new Error("Could not remove the flag.");
    return { ok: true };
  });

/** Gives the full marks of a flagged question to the students who flagged it, or to everyone who sat that exam. Each student gets it once. */
export const directorAwardFlag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, alertId: z.string().uuid(), scope: z.enum(["flaggers", "everyone"]) }).parse(d))
  .handler(async ({ data }) => {
    await dir(data.passcode);
    const sb = await admin();
    const { data: ev } = await sb.from("exam_events").select("bank_id,question_id,round").eq("id", data.alertId).eq("kind", "flag").maybeSingle();
    if (!ev?.bank_id || !ev.question_id || !ev.round) throw new Error("This alert is not a flagged question.");
    let codes: string[] | null = null;
    if (data.scope === "flaggers") {
      const { data: flags } = await sb.from("exam_events").select("student_code").eq("kind", "flag").eq("bank_id", ev.bank_id).eq("question_id", ev.question_id).eq("round", ev.round);
      codes = [...new Set((flags ?? []).map((f) => f.student_code))];
    }
    const { data: gained, error } = await sb.rpc("award_question_marks", { p_bank: ev.bank_id, p_round: ev.round, p_question: ev.question_id, p_codes: codes as string[] });
    if (error) throw new Error("Could not add the marks.");
    const { data: bank } = await sb.from("question_banks").select("subject").eq("id", ev.bank_id).maybeSingle();
    await sb.from("exam_events").insert({ kind: "award", student_code: "DIRECTOR", round: ev.round, bank_id: ev.bank_id, question_id: ev.question_id, message: `Director gave the marks of a flagged ${bank?.subject ?? ""} question to ${data.scope === "flaggers" ? "the students who flagged it" : "everyone who sat it"} · ${gained ?? 0} student(s) gained marks` });
    return { gained: gained ?? 0 };
  });

/** A teacher sees only the marks of their own subject(s) and stream, from every paper of that subject. */
export const teacherMarks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: z.string().max(30) }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const stream = teacherStream(t.stream, t.id);
    const sb = await admin();
    const { data: banks } = await sb.from("question_banks").select("id,title,subject").in("subject", t.subjects.length ? t.subjects : ["-"]).eq("target_stream", stream);
    const bankIds = (banks ?? []).map((b) => b.id);
    if (!bankIds.length) return { stream, subjects: t.subjects, rows: [] };
    const { data: hidden } = await sb.from("exam_rounds").select("round").not("archived_at", "is", null);
    const archived = new Set((hidden ?? []).map((r) => r.round));
    const { data: atts } = await sb.from("exam_attempts").select("id,round,student_code,score,total,status,submitted_at,bank_id").in("bank_id", bankIds).neq("status", "in_progress").is("results_reset_at",null).order("submitted_at", { ascending: false }).limit(2000);
    const codes = [...new Set((atts ?? []).map((a) => a.student_code))];
    const { data: studs } = codes.length ? await sb.from("registered_students").select("student_code,full_name,section,stream").in("student_code", codes).eq("stream", stream) : { data: [] };
    const byCode = new Map((studs ?? []).map((x) => [x.student_code, x]));
    const byBank = new Map((banks ?? []).map((b) => [b.id, b]));
    const rows = (atts ?? []).filter((a) => !archived.has(a.round) && byCode.has(a.student_code)).map((a) => {
      const st = byCode.get(a.student_code); const b = byBank.get(a.bank_id);
      if (!st || !b) return null;
      return { id: a.id, round: a.round, studentCode: a.student_code, name: st.full_name, section: st.section, subject: b.subject, title: b.title, score: a.score ?? 0, total: a.total ?? 0, status: a.status, submittedAt: a.submitted_at };
    }).filter(r => r !== null);
    return { stream, subjects: t.subjects, rows };
  });
