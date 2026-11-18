import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { teacherStream } from "@/lib/admin-rules";
import { readmitDeadline, remainingSeconds } from "@/lib/exam-timing";
import { shuffle } from "@/lib/identity";
import { groupByPassage } from "@/lib/paper";
import { canTakeQuiz, classLabel, quizScore, quizShouldBlock, QUIZ_MAX_MINUTES, QUIZ_MIN_MINUTES, QUIZ_MAX_QUESTIONS } from "@/lib/quiz-rules";
import { teacher, student, figureLinks, type Question } from "@/lib/exam.functions";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
const now = () => new Date().toISOString();
const pass = z.string().min(1).max(200);
const tid = z.string().max(30);
const who = z.object({ name: z.string().min(1).max(100), id: z.string().min(3).max(30), token: z.string().uuid() });
type Quiz = { id: string; teacher_id: string; subject: string; title: string; stream: string; sections: string[]; duration_sec: number; questions: unknown; given: string | null; status: string; results_released: boolean; created_at: string; closed_at: string | null };
const qs = (q: Quiz) => q.questions as Question[];

/** Marks and closes every running attempt whose time is up (or whose quiz was closed). */
async function settle(quizzes: Quiz[]) {
  if (!quizzes.length) return;
  const sb = await admin();
  const byId = new Map(quizzes.map((q) => [q.id, q]));
  const { data } = await sb.from("quiz_attempts").select("*").in("quiz_id", [...byId.keys()]).eq("status", "in_progress");
  for (const a of data ?? []) {
    const q = byId.get(a.quiz_id)!;
    if (q.status === "live" && remainingSeconds(a.deadline_at) > 0) continue;
    const { score, total } = quizScore(qs(q), a.answers as Record<string, number>);
    await sb.from("quiz_attempts").update({ status: "submitted", score, total, submitted_at: now() }).eq("id", a.id).eq("status", "in_progress");
  }
}

/* ---------------- Teacher ---------------- */
export const teacherQuizzes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: tid }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const sb = await admin();
    const stream = teacherStream(t.stream, t.id);
    const [{ data: quizzes }, { data: roster }] = await Promise.all([
      sb.from("class_quizzes").select("*").eq("teacher_id", t.id).order("created_at", { ascending: false }).limit(60),
      sb.from("school_roster").select("grade,section").eq("kind", "student").eq("stream", stream),
    ]);
    const list = (quizzes ?? []) as Quiz[];
    await settle(list.filter((q) => q.status === "live"));
    const { data: attempts } = list.length ? await sb.from("quiz_attempts").select("*").in("quiz_id", list.map((q) => q.id)) : { data: [] };
    const codes = [...new Set((attempts ?? []).map((a) => a.student_code))];
    const { data: people } = codes.length ? await sb.from("registered_students").select("student_code,full_name,grade,section").in("student_code", codes) : { data: [] };
    const who = new Map((people ?? []).map((p) => [p.student_code, p]));
    const sections = [...new Set((roster ?? []).filter((r) => r.section).map((r) => classLabel(r.grade, r.section)))].sort();
    return {
      stream, sections,
      quizzes: list.map((q) => ({
        id: q.id, title: q.title, subject: q.subject, sections: q.sections, minutes: Math.round(q.duration_sec / 60), count: qs(q).length,
        marks: qs(q).reduce((s, x) => s + x.marks, 0), status: q.status, released: q.results_released, createdAt: q.created_at,
        attempts: (attempts ?? []).filter((a) => a.quiz_id === q.id).map((a) => {
          const p = who.get(a.student_code);
          return { code: a.student_code, name: p?.full_name ?? a.student_code, section: p ? classLabel(p.grade, p.section) : "", status: a.status, score: a.score, total: a.total, violations: a.violations, submittedAt: a.submitted_at, secondsLeft: a.status === "in_progress" ? remainingSeconds(a.deadline_at) : 0 };
        }).sort((a, b) => (b.total ? (b.score ?? 0) / b.total : -1) - (a.total ? (a.score ?? 0) / a.total : -1)),
      })),
    };
  });

export const teacherStartQuiz = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    passcode: pass, teacherId: tid, bankId: z.string().uuid(), title: z.string().trim().min(1).max(120),
    sections: z.array(z.string().regex(/^\d{1,2}[A-Z]{1,2}$/)).min(1).max(20), minutes: z.number().int().min(QUIZ_MIN_MINUTES).max(QUIZ_MAX_MINUTES),
  }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const sb = await admin();
    const { data: bank } = await sb.from("question_banks").select("*").eq("id", data.bankId).eq("teacher_id", t.id).neq("status", "archived").maybeSingle();
    if (!bank) throw new Error("Question bank not found.");
    const questions = bank.questions as Question[];
    if (!questions.length) throw new Error("This question bank has no questions yet.");
    if (questions.length > QUIZ_MAX_QUESTIONS) throw new Error(`A class quiz can have at most ${QUIZ_MAX_QUESTIONS} questions.`);
    const stream = teacherStream(t.stream, t.id);
    const { data: roster } = await sb.from("school_roster").select("grade,section").eq("kind", "student").eq("stream", stream);
    const allowed = new Set((roster ?? []).filter((r) => r.section).map((r) => classLabel(r.grade, r.section)));
    const sections = [...new Set(data.sections)];
    if (sections.some((s) => !allowed.has(s))) throw new Error("You can only give a quiz to sections of your own stream.");
    // The questions are copied, so later edits to the bank never change a quiz students already took.
    const { data: row, error } = await sb.from("class_quizzes").insert({ teacher_id: t.id, bank_id: bank.id, subject: bank.subject, title: data.title, stream, sections, duration_sec: data.minutes * 60, questions, given: bank.given }).select("id").single();
    if (error || !row) throw new Error("Could not start the quiz.");
    return { id: row.id };
  });

export const teacherQuizAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: tid, quizId: z.string().uuid(), action: z.enum(["close", "reopen", "release", "hide", "delete"]) }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const sb = await admin();
    const { data: q } = await sb.from("class_quizzes").select("*").eq("id", data.quizId).eq("teacher_id", t.id).maybeSingle();
    if (!q) throw new Error("Quiz not found.");
    if (data.action === "delete") { await sb.from("class_quizzes").delete().eq("id", q.id); return { ok: true }; }
    const patch = data.action === "close" ? { status: "closed", closed_at: now() }
      : data.action === "reopen" ? { status: "live", closed_at: null }
      : { results_released: data.action === "release" };
    const { error } = await sb.from("class_quizzes").update(patch).eq("id", q.id);
    if (error) throw new Error("Could not update the quiz.");
    if (data.action === "close") await settle([{ ...(q as Quiz), status: "closed" }]);
    return { ok: true };
  });

/** Lets a blocked student back in with the time they still had when blocked. */
export const teacherQuizReadmit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, teacherId: tid, quizId: z.string().uuid(), studentCode: z.string().max(30) }).parse(d))
  .handler(async ({ data }) => {
    const t = await teacher(data.passcode, data.teacherId);
    const sb = await admin();
    const { data: q } = await sb.from("class_quizzes").select("id,status,duration_sec").eq("id", data.quizId).eq("teacher_id", t.id).maybeSingle();
    if (!q) throw new Error("Quiz not found.");
    if (q.status !== "live") throw new Error("Open the quiz again before re-admitting a student.");
    const { data: a } = await sb.from("quiz_attempts").select("*").eq("quiz_id", q.id).eq("student_code", data.studentCode).eq("status", "blocked").maybeSingle();
    if (!a) throw new Error("This student is not blocked.");
    const deadline = readmitDeadline(a.deadline_at, a.blocked_at, Date.now(), q.duration_sec);
    const { error } = await sb.from("quiz_attempts").update({ status: "in_progress", violations: 0, score: null, total: null, submitted_at: null, blocked_at: null, deadline_at: deadline, last_seen_at: now() }).eq("id", a.id).eq("status", "blocked");
    if (error) throw new Error("Could not re-admit the student.");
    return { ok: true };
  });

/* ---------------- Student ---------------- */
async function quizFor(st: { grade: string; section: string; stream: string }, quizId: string) {
  const sb = await admin();
  const { data } = await sb.from("class_quizzes").select("*").eq("id", quizId).maybeSingle();
  const q = data as Quiz | null;
  if (!q || !canTakeQuiz(st, q)) throw new Error("This quiz is not for your class.");
  return q;
}

export const studentQuizList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const sb = await admin();
    const { data: rows } = await sb.from("class_quizzes").select("*").eq("stream", st.stream).contains("sections", [classLabel(st.grade, st.section)]).order("created_at", { ascending: false }).limit(40);
    const list = (rows ?? []) as Quiz[];
    await settle(list.filter((q) => q.status === "live"));
    const { data: mine } = list.length ? await sb.from("quiz_attempts").select("quiz_id,status,score,total").eq("student_code", st.student_code).in("quiz_id", list.map((q) => q.id)) : { data: [] };
    const att = new Map((mine ?? []).map((a) => [a.quiz_id, a]));
    return list.filter((q) => q.status === "live" || att.has(q.id)).map((q) => {
      const a = att.get(q.id);
      return { id: q.id, title: q.title, subject: q.subject, minutes: Math.round(q.duration_sec / 60), count: qs(q).length, live: q.status === "live", status: a?.status ?? null, released: q.results_released, score: q.results_released ? a?.score ?? null : null, total: q.results_released ? a?.total ?? null : null };
    });
  });

async function paperOf(q: Quiz, code: string) {
  const ordered = shuffle(groupByPassage(qs(q)), code + q.id).flat();
  const links = await figureLinks(ordered.map((x) => x.figure));
  return ordered.map((x) => ({
    id: x.id, text: x.text, marks: x.marks, passage: x.passage ?? null, figureUrl: x.figure ? links[x.figure] ?? null : null,
    choices: shuffle([0, 1, 2, 3], code + x.id + q.id).map((orig) => ({ value: orig, label: x.options[orig] })),
  }));
}

export const studentQuizOpen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.extend({ quizId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const q = await quizFor(st, data.quizId);
    const sb = await admin();
    await settle([q]);
    let { data: a } = await sb.from("quiz_attempts").select("*").eq("quiz_id", q.id).eq("student_code", st.student_code).maybeSingle();
    if (!a) {
      if (q.status !== "live") throw new Error("This quiz is closed.");
      const ins = await sb.from("quiz_attempts").insert({ quiz_id: q.id, student_code: st.student_code, deadline_at: new Date(Date.now() + q.duration_sec * 1000).toISOString(), last_seen_at: now() }).select("*").single();
      if (ins.error) {
        const again = await sb.from("quiz_attempts").select("*").eq("quiz_id", q.id).eq("student_code", st.student_code).single();
        if (!again.data) throw new Error("Could not start the quiz.");
        a = again.data;
      } else a = ins.data;
    }
    return { attemptId: a.id, currentQuestion: a.current_question, pauseReason: null as string | null, paused: false, attemptStatus: a.status, answers: a.answers as Record<string, number>, violations: a.violations, secondsLeft: a.status === "in_progress" ? remainingSeconds(a.deadline_at) : 0, examLive: q.status === "live", title: q.title, subject: q.subject, given: q.given, practice: false, paper: await paperOf(q, st.student_code) };
  });

export const studentQuizSync = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.extend({
    quizId: z.string().uuid(), answers: z.record(z.string().max(60), z.number().int().min(0).max(3)),
    violation: z.enum(["fullscreen", "focus"]).optional(), submit: z.boolean().optional(), connectionLost: z.boolean().optional(), current: z.number().int().min(0).max(1000).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const q = await quizFor(st, data.quizId);
    const sb = await admin();
    const { data: a } = await sb.from("quiz_attempts").select("*").eq("quiz_id", q.id).eq("student_code", st.student_code).maybeSingle();
    if (!a) throw new Error("Quiz not started.");
    const base = { pauseReason: null as string | null, paused: false, examLive: q.status === "live" };
    const left = remainingSeconds(a.deadline_at);
    if (a.status !== "in_progress") return { ...base, status: a.status, violations: a.violations, secondsLeft: 0, timeUp: false };
    const violations = a.violations + (data.violation ? 1 : 0);
    const { score, total } = quizScore(qs(q), data.answers);
    if (quizShouldBlock(violations)) {
      await sb.from("quiz_attempts").update({ status: "blocked", answers: data.answers, violations, score, total, submitted_at: now(), blocked_at: now() }).eq("id", a.id).eq("status", "in_progress");
      return { ...base, status: "blocked", violations, secondsLeft: left, timeUp: false };
    }
    const timeUp = left <= 0 || q.status !== "live";
    if (data.submit || timeUp) {
      await sb.from("quiz_attempts").update({ status: "submitted", answers: data.answers, violations, score, total, submitted_at: now() }).eq("id", a.id).eq("status", "in_progress");
      return { ...base, status: "submitted", violations, secondsLeft: left, timeUp: timeUp && !data.submit };
    }
    await sb.from("quiz_attempts").update({ answers: data.answers, violations, last_seen_at: now(), ...(data.current !== undefined ? { current_question: data.current } : {}) }).eq("id", a.id).eq("status", "in_progress");
    return { ...base, status: "in_progress", violations, secondsLeft: left, timeUp: false };
  });

/** After the teacher releases results: the student's score with every right answer. */
export const studentQuizReview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => who.extend({ quizId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const st = await student(data);
    const q = await quizFor(st, data.quizId);
    if (!q.results_released) throw new Error("Your teacher has not released the results yet.");
    const sb = await admin();
    const { data: a } = await sb.from("quiz_attempts").select("*").eq("quiz_id", q.id).eq("student_code", st.student_code).maybeSingle();
    if (!a || a.status === "in_progress") throw new Error("You have no finished attempt for this quiz.");
    const paper = await paperOf(q, st.student_code);
    const correct = Object.fromEntries(qs(q).map((x) => [x.id, x.answer]));
    return { title: q.title, subject: q.subject, score: a.score ?? 0, total: a.total ?? 0, blocked: a.status === "blocked", answers: a.answers as Record<string, number>, correct, paper };
  });
