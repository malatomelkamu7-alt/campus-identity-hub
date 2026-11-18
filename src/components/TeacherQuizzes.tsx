import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookCheck, Play, Square, Eye, EyeOff, Trash2, RotateCcw, UserCheck } from "lucide-react";
import { Panel, Btn } from "@/components/Shell";
import { fmt } from "@/lib/identity";
import { QUIZ_MAX_MINUTES, QUIZ_MIN_MINUTES } from "@/lib/quiz-rules";
import { teacherQuizzes, teacherStartQuiz, teacherQuizAction, teacherQuizReadmit } from "@/lib/quiz.functions";

type Auth = { tid: string; pw: string };
type Bank = { id: string; title: string; subject: string; questions: unknown[] };

/** A teacher's own quizzes: pick a question bank and sections, start it, release results, re-admit blocked students. */
export function TeacherQuizzes({ auth, banks }: { auth: Auth; banks: Bank[] }) {
  const list = useServerFn(teacherQuizzes);
  const start = useServerFn(teacherStartQuiz);
  const act = useServerFn(teacherQuizAction);
  const readmit = useServerFn(teacherQuizReadmit);
  const qc = useQueryClient();
  const cred = { passcode: auth.pw, teacherId: auth.tid };
  const { data } = useQuery({ queryKey: ["teacher-quizzes", auth.tid], queryFn: () => list({ data: cred }), refetchInterval: 5000 });
  const usable = banks.filter((b) => b.questions.length);
  const [bankId, setBankId] = useState(""); const [title, setTitle] = useState(""); const [minutes, setMinutes] = useState(20);
  const [sections, setSections] = useState<string[]>([]);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const bank = usable.find((b) => b.id === bankId);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(""); setMsg(""); setBusy(true);
    try { await fn(); setMsg(done); await qc.invalidateQueries({ queryKey: ["teacher-quizzes"] }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Action failed."); } finally { setBusy(false); }
  };
  if (!data) return <p className="text-muted-foreground">Loading quizzes…</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Give a class quiz" icon={<Play className="h-4 w-4" />}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!bank) return; run(async () => { await start({ data: { ...cred, bankId: bank.id, title: title.trim() || bank.title, sections, minutes } }); setBankId(""); setTitle(""); setSections([]); }, "Quiz started. Students of the chosen sections can open it now."); }}>
          <label className="block text-xs text-muted-foreground">Question bank
            <select className="field mt-1" value={bankId} onChange={(e) => { setBankId(e.target.value); setTitle(usable.find((b) => b.id === e.target.value)?.title ?? ""); }} required>
              <option value="">Choose one of your banks</option>
              {usable.map((b) => <option key={b.id} value={b.id}>{b.title} · {b.questions.length} Q</option>)}
            </select>
          </label>
          {!usable.length && <p className="text-xs text-warning">Upload a paper under “Question banks” first.</p>}
          <label className="block text-xs text-muted-foreground">Quiz name<input className="field mt-1" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 3 quiz" /></label>
          <div className="text-xs text-muted-foreground">Sections that may take it ({data.stream})
            <div className="mt-1 flex flex-wrap gap-2">
              {data.sections.map((s) => { const on = sections.includes(s); return (
                <button type="button" key={s} onClick={() => setSections(on ? sections.filter((x) => x !== s) : [...sections, s])} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:border-primary"}`}>Grade {s}</button>
              ); })}
            </div>
          </div>
          <label className="block text-xs text-muted-foreground">Time (minutes)<input type="number" className="field mt-1" min={QUIZ_MIN_MINUTES} max={QUIZ_MAX_MINUTES} value={minutes} onChange={(e) => setMinutes(Math.min(QUIZ_MAX_MINUTES, Math.max(QUIZ_MIN_MINUTES, +e.target.value || QUIZ_MIN_MINUTES)))} /></label>
          <Btn className="w-full" disabled={busy || !bank || !sections.length}><Play className="h-4 w-4" />Start quiz</Btn>
          <p className="text-xs text-muted-foreground">Only the chosen sections see it. Fullscreen is strict: a student who leaves it more than 2 times is blocked until you re-admit them. Students see their score only after you release results.</p>
        </form>
      </Panel>
      <div className="space-y-4 lg:col-span-2">
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        {msg && <p role="status" className="text-sm text-accent">{msg}</p>}
        {!data.quizzes.length && <Panel title="My class quizzes" icon={<BookCheck className="h-4 w-4" />}><p className="text-sm text-muted-foreground">No quizzes yet.</p></Panel>}
        {data.quizzes.map((q) => {
          const done = q.attempts.filter((a) => a.status !== "in_progress");
          const avg = done.length ? Math.round(done.reduce((s, a) => s + (a.total ? (a.score ?? 0) / a.total : 0), 0) * 100 / done.length) : null;
          return (
            <Panel key={q.id} title={q.title} icon={<BookCheck className="h-4 w-4" />}
              action={<span className={`rounded-full border px-2.5 py-0.5 text-xs ${q.status === "live" ? "border-accent/50 text-accent" : "border-border text-muted-foreground"}`}>{q.status === "live" ? "Open" : "Closed"}</span>}>
              <div className="mb-3 text-xs text-muted-foreground">{q.subject} · Grade {q.sections.join(", ")} · {q.count} Q · {q.marks} marks · {q.minutes} min · {new Date(q.createdAt).toLocaleString()}</div>
              <div className="mb-3 flex flex-wrap gap-2">
                {q.status === "live"
                  ? <Btn variant="ghost" className="py-1 text-xs" disabled={busy} onClick={() => run(() => act({ data: { ...cred, quizId: q.id, action: "close" } }), "Quiz closed. Unfinished students were submitted.")}><Square className="h-3.5 w-3.5" />Close quiz</Btn>
                  : <Btn variant="ghost" className="py-1 text-xs" disabled={busy} onClick={() => run(() => act({ data: { ...cred, quizId: q.id, action: "reopen" } }), "Quiz opened again.")}><RotateCcw className="h-3.5 w-3.5" />Open again</Btn>}
                {q.released
                  ? <Btn variant="ghost" className="py-1 text-xs" disabled={busy} onClick={() => run(() => act({ data: { ...cred, quizId: q.id, action: "hide" } }), "Results hidden from students.")}><EyeOff className="h-3.5 w-3.5" />Hide results</Btn>
                  : <Btn className="py-1 text-xs" disabled={busy} onClick={() => run(() => act({ data: { ...cred, quizId: q.id, action: "release" } }), "Results released. Students can see their score and the right answers.")}><Eye className="h-3.5 w-3.5" />Release results</Btn>}
                {confirmDel === q.id
                  ? <><Btn variant="ghost" className="py-1 text-xs text-destructive" disabled={busy} onClick={() => run(() => act({ data: { ...cred, quizId: q.id, action: "delete" } }), "Quiz deleted.")}>Yes, delete with its marks</Btn><Btn variant="ghost" className="py-1 text-xs" onClick={() => setConfirmDel(null)}>Cancel</Btn></>
                  : <Btn variant="ghost" className="py-1 text-xs" onClick={() => setConfirmDel(q.id)}><Trash2 className="h-3.5 w-3.5" />Delete</Btn>}
                <span className="ml-auto self-center text-xs text-muted-foreground">{done.length} finished · {q.attempts.length - done.length} writing{avg !== null ? ` · average ${avg}%` : ""}</span>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">#</th><th className="p-2">Student</th><th className="p-2">Sec</th><th className="p-2">Status</th><th className="p-2">Marks</th><th className="p-2">%</th></tr></thead>
                <tbody>{q.attempts.map((a, i) => {
                  const pct = a.total ? Math.round((a.score ?? 0) * 100 / a.total) : null;
                  return <tr key={a.code} className="border-t border-border">
                    <td className="p-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="p-2"><div className="break-words">{a.name}</div><div className="font-mono text-xs text-muted-foreground">{a.code}</div></td>
                    <td className="p-2">{a.section}</td>
                    <td className="p-2 text-xs">{a.status === "in_progress" ? <span className="text-primary">writing · {fmt(a.secondsLeft)} left · {a.violations} warn</span>
                      : a.status === "blocked" ? <span className="flex flex-wrap items-center gap-2 text-destructive">blocked{q.status === "live" && <Btn variant="ghost" className="px-2 py-0.5 text-xs" disabled={busy} onClick={() => run(() => readmit({ data: { ...cred, quizId: q.id, studentCode: a.code } }), `${a.name} re-admitted with the time they had left.`)}><UserCheck className="h-3.5 w-3.5" />Re-admit</Btn>}</span>
                      : <span className="text-accent">submitted</span>}</td>
                    <td className="p-2 font-mono">{a.total ? `${a.score ?? 0}/${a.total}` : "—"}</td>
                    <td className={`p-2 font-semibold ${pct === null ? "" : pct >= 50 ? "text-accent" : "text-destructive"}`}>{pct ?? "—"}</td>
                  </tr>;
                })}</tbody>
              </table>{!q.attempts.length && <p className="py-4 text-center text-sm text-muted-foreground">No student has opened this quiz yet.</p>}</div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
