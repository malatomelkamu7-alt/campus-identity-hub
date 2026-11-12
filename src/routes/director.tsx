import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { Power, Megaphone, Timer, Table2, KeyRound, ListChecks, Plus, Radio, UserCheck, AlertTriangle, Layers, Trash2, CalendarDays, Download, Pause, Play, Search, BarChart3, RotateCcw, Trophy, Medal, Award, WifiOff, Wifi, Settings, X, Users, BookOpenCheck, DoorClosed, CheckCircle2, LifeBuoy } from "lucide-react";
import { Shell, Panel, Toggle, Btn } from "@/components/Shell";
import { directorDashboard, directorUpdate, directorClock, directorNewRound, directorReadmit, directorChangePassword, directorRemove, directorRemoveBank, directorResetResults, directorStudentTime, directorAwardFlag } from "@/lib/exam.functions";
import { backOnline } from "@/lib/exam-timing";
import { subjectsFor, fmt } from "@/lib/identity";
import { scoreBands, totalScore, maxTotal, rankRows, matchesPerson } from "@/lib/results";

export const Route = createFileRoute("/director")({
  head: () => ({
    meta: [
      { title: "Director Console — Burka Harbu Exams" },
      { name: "description", content: "Control live exams, rounds, the master timer and official results release." },
      { property: "og:title", content: "Director Console — Burka Harbu Exams" },
      { property: "og:description", content: "Exam and results controller for Burka Harbu Special Secondary School." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Director,
});

function Director() {
  const load = useServerFn(directorDashboard);
  const [pass, setPass] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!pass)
    return (
      <Shell title="Director Console" subtitle="Exam & Results Controller">
        <form className="tile mx-auto max-w-sm space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr("");
          try { await load({ data: { passcode: input } }); setPass(input); setInput(""); }
          catch (e) { setErr(e instanceof Error ? e.message : "Could not sign in."); } finally { setBusy(false); }
        }}>
          <img src="/school-logo.jpg" alt="Burka Harbu logo" className="mx-auto h-20 w-20 rounded-full ring-2 ring-primary/40 glow" />
          <h2 className="text-center font-semibold">Director sign in</h2>
          <input type="password" autoComplete="current-password" className="field" placeholder="Password" value={input} onChange={(e) => setInput(e.target.value)} required />
          {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          <Btn className="w-full" disabled={busy || !input}>{busy ? "Checking…" : "Unlock console"}</Btn>
        </form>
      </Shell>
    );
  return <Console pass={pass} onPass={setPass} />;
}

function Console({ pass, onPass }: { pass: string; onPass: (p: string) => void }) {
  const load = useServerFn(directorDashboard);
  const update = useServerFn(directorUpdate);
  const clock = useServerFn(directorClock);
  const newRound = useServerFn(directorNewRound);
  const readmit = useServerFn(directorReadmit);
  const remove = useServerFn(directorRemove);
  const removeBank = useServerFn(directorRemoveBank);
  const resetResults = useServerFn(directorResetResults);
  const awardFlag = useServerFn(directorAwardFlag);
  const timeFn = useServerFn(directorStudentTime);
  const [awardFor, setAwardFor] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [notice, setNotice] = useState("");
  const [queueStream, setQueueStream] = useState("Natural Science");
  const qc = useQueryClient();
  const [viewRound, setViewRound] = useState<number | undefined>();
  const [extra, setExtra] = useState(10);
  const [err, setErr] = useState("");
  const { data: d } = useQuery({ queryKey: ["director", viewRound], queryFn: () => load({ data: { passcode: pass, round: viewRound } }), refetchInterval: 3000 });
  const act = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); await qc.invalidateQueries(); } catch (e) { setErr(e instanceof Error ? e.message : "Action failed."); } };
  if (!d) return <Shell title="Director Console" subtitle="Loading…"><p className="text-muted-foreground">Loading…</p></Shell>;
  const s = d.settings;
  const attemptBy = new Map(d.attempts.map((a) => [a.student_code, a]));
  const started = d.participationStudents.filter((x) => attemptBy.has(x.student_code));
  const notStarted = d.participationStudents.filter((x) => !attemptBy.has(x.student_code));
  const blocked = d.attempts.filter((a) => a.status === "blocked");
  const nameOf = (c: string) => d.students.find((x) => x.student_code === c)?.full_name ?? c;
  const bankTitle = (id: string | null) => (id ? d.banks.find((b) => b.id === id)?.title ?? null : null);
  const isActive = (id: string) => s.activeBankId === id || s.socialBankId === id;
  const activeFor = (stream: string) => (stream === "Social Science" ? s.socialBankId : s.activeBankId);
  // Help requests stay at the top until the Director removes them.
  const alerts = [...d.events.filter((e) => e.kind === "help"), ...d.events.filter((e) => e.kind !== "help")];
  const helpCount = alerts.filter((e) => e.kind === "help").length;

  return (
    <Shell title="Director Console" subtitle={`Round ${s.round} · Burka Harbu Special Secondary School`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">Natural: <span className="font-semibold text-foreground">{bankTitle(s.activeBankId) ?? "no paper"}</span></span>
        <span className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">Social: <span className="font-semibold text-foreground">{bankTitle(s.socialBankId) ?? "no paper"}</span></span>
        <button type="button" title="Settings" aria-label="Open settings" onClick={() => setShowSettings(true)} className="ml-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/40 text-primary transition hover:rotate-45 hover:bg-secondary"><Settings className="h-5 w-5" /></button>
      </div>
      {showSettings && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Director settings" onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}>
        <div className="glass mt-4 w-full max-w-lg space-y-4 p-4 sm:mt-10 sm:p-5">
          <div className="flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Settings</h2><button type="button" aria-label="Close settings" className="ml-auto rounded-lg p-1 text-muted-foreground hover:text-foreground" onClick={() => setShowSettings(false)}><X className="h-5 w-5" /></button></div>
          <section className="space-y-4 rounded-xl border border-border p-4">
            <Row label={<span className="flex items-center gap-1.5"><BookOpenCheck className="h-3.5 w-3.5" />SAT subject</span>} desc={s.satEnabled ? "SAT included — totals are out of 600" : "SAT not offered — totals are out of 500"}><Toggle label="SAT enabled" on={s.satEnabled} onChange={(v) => act(() => update({ data: { passcode: pass, satEnabled: v } }))} /></Row>
            <Row label={<span className="flex items-center gap-1.5"><DoorClosed className="h-3.5 w-3.5" />Auto-close when all submit</span>} desc={s.autoClose ? "You only open the exam. It closes by itself once every admitted student has submitted — students given extra or paused time are waited for" : "The exam stays open until you close it or the schedule ends"}><Toggle label="Auto-close when all submit" on={s.autoClose} onChange={(v) => act(() => update({ data: { passcode: pass, autoClose: v } }))} /></Row>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div><div className="text-sm font-medium">Exam round</div><div className="text-xs text-muted-foreground">Currently Round {s.round}. Old rounds are kept.</div></div>
              <Btn variant="ghost" onClick={() => confirm(`Close Round ${s.round} and start Round ${s.round + 1}?`) && act(() => newRound({ data: { passcode: pass } }))}><Layers className="h-4 w-4" />New round</Btn>
            </div>
          </section>
          <ChangePassword pass={pass} onChanged={onPass} />
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </div>
      </div>}
      {err && <p role="alert" className="mb-4 text-sm text-destructive">{err}</p>}
      {notice && <p role="status" className="mb-4 text-sm text-accent">{notice}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Global switches" icon={<Power className="h-4 w-4" />}>
          <div className="space-y-4">
            <Row label="Auto schedule" desc={s.autoSchedule ? "Scheduled opening and closing enabled" : "Manual control"}><Toggle label="Auto schedule" on={s.autoSchedule} onChange={v => act(() => update({ data: { passcode: pass, autoSchedule: v } }))} /></Row>
            <Row label="Exam session open" desc={sessionDesc(s)}>{s.examLive && s.autoClose && !s.autoSchedule
              ? <span className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent" title="Turn Auto close off in Settings to close it yourself"><DoorClosed className="h-3.5 w-3.5" />Auto close</span>
              : <Toggle label="Exam session open" on={s.examLive} onChange={(v) => !s.autoSchedule && act(() => update({ data: { passcode: pass, examLive: v } }))} />}</Row>
            <Row label={<span className="flex items-center gap-1.5"><Megaphone className="h-3.5 w-3.5" />Publish results</span>} desc={s.resultsPublished ? "Scorecards visible" : "Scorecards hidden"}><Toggle label="Publish results" on={s.resultsPublished} onChange={(v) => act(() => update({ data: { passcode: pass, resultsPublished: v } }))} /></Row>
          </div>
        </Panel>

        <Panel title="Exam schedule & duration" icon={<CalendarDays className="h-4 w-4" />}>
          <Schedule key={`${s.scheduledStart}-${s.scheduledClose}-${s.durationMin}`} start={s.scheduledStart} close={s.scheduledClose} duration={s.durationMin} disabled={s.examLive} onSave={(v) => act(() => update({ data: { passcode: pass, ...v } }))} />
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm"><span className="flex items-center gap-2"><Timer className="h-4 w-4" />Per student</span><span className="font-mono font-semibold text-primary">{s.durationMin + s.extensionMin} min</span></div>
          <div className="mt-3 flex items-center gap-2">
            <input type="number" min={1} max={180} aria-label="Extra minutes" className="field w-20" value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
            <Btn variant="ghost" className="flex-1" disabled={!s.examLive} onClick={() => act(() => clock({ data: { passcode: pass, action: "extend", minutes: extra } }))}><Plus className="h-4 w-4" />Add minutes</Btn>
          </div>
        </Panel>

        <Panel title="Exam queue" icon={<ListChecks className="h-4 w-4" />}>
          <div className="mb-3 grid grid-cols-2 gap-2">{["Natural Science", "Social Science"].map(stream => <Btn key={stream} variant={queueStream === stream ? "primary" : "ghost"} className="px-2" onClick={() => setQueueStream(stream)}>{stream.split(" ")[0]}{activeFor(stream) && <CheckCircle2 className="h-3.5 w-3.5" aria-label="Has an active paper" />}</Btn>)}</div>
          <p className="mb-3 text-xs text-muted-foreground">Pick one paper per stream. Natural and Social papers can be active at the same time, so both streams sit their exam together.</p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {d.banks.filter(b => b.stream === queueStream).map(b => <div key={b.id} className="flex items-stretch gap-2">
              <Btn variant="ghost" disabled={s.examLive} onClick={() => act(() => update({ data: { passcode: pass, activeBankId: b.id } }))} className={`min-w-0 flex-1 justify-start p-3 text-left ${isActive(b.id) ? "border-primary bg-primary/10" : ""}`}>
                <span className="min-w-0"><span className="block break-words font-semibold">{b.title}</span><span className="block text-xs text-muted-foreground">{b.subject} · {b.count} questions{isActive(b.id) ? " · ACTIVE" : ""}</span></span>
              </Btn>
              <Btn variant="ghost" className="shrink-0 px-2" title={`Remove ${b.title} from queue`} aria-label={`Remove ${b.title} from queue`} disabled={s.examLive && isActive(b.id)} onClick={() => confirm(`Remove ${b.title} from the queue? Saved marks and the teacher's paper remain.`) && act(() => removeBank({ data: { passcode: pass, id: b.id } }))}><Trash2 className="h-4 w-4" /></Btn>
            </div>)}
            {!d.banks.some(b => b.stream === queueStream) && <p className="text-sm text-muted-foreground">No queued exams for {queueStream}.</p>}
          </div>
          {activeFor(queueStream) && <Btn variant="ghost" className="mt-3 w-full text-xs" disabled={s.examLive} onClick={() => act(() => update({ data: { passcode: pass, clearStream: queueStream as "Natural Science" } }))}><X className="h-3.5 w-3.5" />No exam for {queueStream} this session</Btn>}
        </Panel>

      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={`Live participation · ${d.attempts.filter(a => a.status === "in_progress").length} live · ${started.length} started / ${notStarted.length} not started`} icon={<Radio className="h-4 w-4" />} >
          {!s.examLive && <p className="mb-3 text-sm text-muted-foreground">Exam is not live.</p>}
          <p className="mb-3 text-xs text-muted-foreground">{s.scheduledStart ? new Date(s.scheduledStart).toLocaleString() + " – " + new Date(s.scheduledClose ?? s.scheduledStart).toLocaleString() : "No exam date set"}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">Started</div>
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">{started.map((x) => { const a = attemptBy.get(x.student_code); if (!a) return null; return (
                <li key={x.student_code} className="flex items-center gap-2"><span className={a.status === "blocked" ? "dot-off" : "dot-live"} /><span className="min-w-0 flex-1 truncate">{x.full_name}</span><span className="font-mono text-xs text-muted-foreground">{x.student_code}</span>{a.status === "in_progress" && a.pause_reason === "connection" && <WifiOff className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Connection lost" />}<span className="text-xs">{a.status === "submitted" ? "✓" : a.status === "blocked" ? "blocked" : `${a.violations}⚠`}</span></li>); })}</ul>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Not started</div>
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm text-muted-foreground">{notStarted.map((x) => <li key={x.student_code} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{x.full_name}</span><span className="font-mono text-xs">{x.student_code}</span></li>)}</ul>
            </div>
          </div>
          {!!blocked.length && <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 text-sm font-semibold text-destructive">Blocked students</div>
            {blocked.map((a) => <div key={a.student_code} className="flex items-center gap-2 py-1 text-sm"><span className="flex-1">{nameOf(a.student_code)} <span className="font-mono text-xs text-muted-foreground">{a.student_code}</span></span><Btn variant="ghost" className="py-1 text-xs" onClick={() => act(() => readmit({ data: { passcode: pass, studentCode: a.student_code } }))}><UserCheck className="h-3.5 w-3.5" />Re-admit</Btn></div>)}
          </div>}
        </Panel>
        <Panel title={helpCount ? `Alerts · ${helpCount} need help` : "Alerts"} icon={helpCount ? <LifeBuoy className="h-4 w-4 animate-pulse text-warning" /> : <AlertTriangle className="h-4 w-4" />} action={!!d.events.length && <Btn variant="danger" className="px-3 py-1 text-xs" title="Delete all alerts" aria-label="Delete all alerts" onClick={() => confirm(`Delete all ${d.events.length} alert(s)? Marks and awarded points are kept.`) && act(async () => { await remove({ data: { passcode: pass, allAlerts: true } }); setAwardFor(null); setNotice("All alerts removed."); })}><Trash2 className="h-3.5 w-3.5" />Delete all</Btn>}>
          <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
            {alerts.map((e) => <li key={e.id} className={`rounded-lg border p-2 ${e.kind === "help" ? "border-2 border-accent bg-accent/10" : e.kind === "violation" || e.kind === "blocked" ? "border-destructive/40 bg-destructive/10" : e.kind === "flag" ? "border-warning/40 bg-warning/10" : "border-border"}`}>
              <div className="flex items-start gap-2">{e.kind === "help" && <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />}<div className="min-w-0 flex-1"><div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleTimeString()} · {e.kind === "help" ? <span className="font-semibold text-accent">Help needed</span> : e.kind} · {e.student_code}</div><span className={e.kind === "help" ? "font-medium" : ""}>{e.message}</span></div>{e.kind === "flag" && e.bank_id && e.question_id && <Btn variant="ghost" className="px-2 py-1" title="Add marks for this question" aria-label="Add marks for this flagged question" onClick={() => setAwardFor(awardFor === e.id ? null : e.id)}><Award className="h-4 w-4" /></Btn>}<Btn variant="ghost" className="px-2 py-1" title="Remove alert" aria-label="Remove alert" onClick={() => act(() => remove({ data: { passcode: pass, alertId: e.id } }))}><Trash2 className="h-4 w-4" /></Btn></div>
                {e.kind === "flag" && <div className="mt-1 text-xs text-warning">Flagged by {d.flagCounts[`${e.bank_id}|${e.question_id}`] ?? 1} student(s)</div>}
                {awardFor === e.id && <div className="mt-2 rounded-lg border border-border bg-background/60 p-2">
                  <div className="mb-2 text-xs text-muted-foreground">If this question is wrong, give its full marks. Students who already answered it correctly keep the same score. Each student gets it only once.</div>
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="accent" className="py-1 text-xs" onClick={() => act(async () => { const r = await awardFlag({ data: { passcode: pass, alertId: e.id, scope: "flaggers" } }); setNotice(`Marks added — ${r.gained} student(s) gained points.`); setAwardFor(null); })}><Award className="h-3.5 w-3.5" />To students who flagged it ({d.flagCounts[`${e.bank_id}|${e.question_id}`] ?? 1})</Btn>
                    <Btn variant="ghost" className="py-1 text-xs" onClick={() => act(async () => { const r = await awardFlag({ data: { passcode: pass, alertId: e.id, scope: "everyone" } }); setNotice(`Marks added — ${r.gained} student(s) gained points.`); setAwardFor(null); })}>To everyone who sat it</Btn>
                    <Btn variant="ghost" className="py-1 text-xs" onClick={() => setAwardFor(null)}>Cancel</Btn>
                  </div>
                </div>}</li>)}
            {!d.events.length && <li className="text-muted-foreground">No alerts yet.</li>}
          </ul>
        </Panel>
      </div>

      <ExamRoom students={d.students} attempts={d.attempts} selected={s.selectedStudentCodes} live={s.examLive} autoSchedule={s.autoSchedule} autoCompleted={s.autoCompleted}
        onSave={(codes) => act(async () => { await update({ data: { passcode: pass, selectedStudentCodes: codes } }); setNotice(codes === null ? "Every verified student may now start." : `${codes.length} student(s) admitted to the exam room. Everyone else cannot start.`); })} />

      <ConnectionLost attempts={d.attempts} nameOf={nameOf} live={s.examLive}
        onResume={(ids) => act(async () => { for (const id of ids) await timeFn({ data: { passcode: pass, attemptId: id, action: "resume" } }); })} />

      <StudentTime pass={pass} live={s.examLive} attempts={d.attempts} nameOf={nameOf} onAct={act} />

      <Panel className="mt-4" title={`Score summary · Round ${d.viewRound}`} icon={<BarChart3 className="h-4 w-4" />}>
        <ScoreSummary students={d.students} results={d.results} sat={s.satEnabled || d.results.some((r) => r.subject === "SAT")} />
      </Panel>

      <Panel className="mt-4" title="Results matrix" icon={<Table2 className="h-4 w-4" />} action={
        <div className="flex items-center gap-2"><select aria-label="Round" className="field w-auto" value={d.viewRound} onChange={(e) => setViewRound(Number(e.target.value))}>{d.rounds.map((r) => <option key={r} value={r}>Round {r}</option>)}</select><Btn variant="ghost" className="px-2" title="Remove selected round" aria-label="Remove selected round" disabled={d.viewRound === s.round} onClick={() => confirm(`Remove Round ${d.viewRound} from scorecards? Saved marks remain retained.`) && act(async () => { await remove({ data: { passcode: pass, round: d.viewRound } }); setViewRound(undefined); })}><Trash2 className="h-4 w-4" /></Btn></div>}>
        <Matrix students={d.students} results={d.results} sat={s.satEnabled || d.results.some((r) => r.subject === "SAT")} round={d.viewRound} onReset={(stream) => confirm(`Reset all ${stream} results for Round ${d.viewRound}? Every score shows "—" again. This cannot be undone.`) && act(() => resetResults({ data: { passcode: pass, round: d.viewRound, stream: stream as "Natural Science" } }))} />
      </Panel>
    </Shell>
  );
}

type DirStudent = { student_code: string; full_name: string; stream: string; section: string; gender: string };
type DirResult = { student_code: string; subject: string; score_pct: number };
const STREAMS = ["Natural Science", "Social Science"] as const;

function resultRows(students: DirStudent[], results: DirResult[], stream: string) {
  return students.filter((s) => s.stream === stream).map((s) => {
    const sc: Record<string, number> = Object.fromEntries(results.filter((r) => r.student_code === s.student_code).map((r) => [r.subject, r.score_pct]));
    const vals = Object.values(sc);
    return { s, sc, total: totalScore(sc), avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
  }).sort((a, b) => b.total - a.total || (b.avg ?? -1) - (a.avg ?? -1));
}

function downloadResults(students: DirStudent[], results: DirResult[], sat: boolean, round: number, bySection: boolean) {
  const wb = XLSX.utils.book_new();
  for (const stream of STREAMS) {
    const subjects = subjectsFor(stream, sat);
    const rows = resultRows(students, results, stream);
    const groups = bySection ? [...new Set(rows.map((r) => r.s.section))].sort().map((sec) => ({ name: `${stream === "Natural Science" ? "Natural" : "Social"} ${sec}`, rows: rows.filter((r) => r.s.section === sec) })) : [{ name: stream, rows }];
    for (const g of groups) {
      const sheet = XLSX.utils.aoa_to_sheet([
        ["Rank", "ID", "Name", "Section", "Gender", ...subjects, `Total (/${subjects.length * 100})`, "Average"],
        ...g.rows.map((r, i) => [i + 1, r.s.student_code, r.s.full_name, r.s.section, r.s.gender === "F" ? "Female" : r.s.gender === "M" ? "Male" : "", ...subjects.map((x) => r.sc[x] ?? ""), Object.keys(r.sc).length ? r.total : "", r.avg ?? ""]),
      ]);
      XLSX.utils.book_append_sheet(wb, sheet, g.name.slice(0, 31));
    }
  }
  XLSX.writeFile(wb, `burka-harbu-results-round-${round}${bySection ? "-by-section" : ""}.xlsx`);
}

function ScoreSummary({ students, results, sat }: { students: DirStudent[]; results: DirResult[]; sat: boolean }) {
  const max = maxTotal(sat);
  return <div className="grid gap-4 md:grid-cols-2">
    {STREAMS.map((stream) => {
      const rows = scoreBands(resultRows(students, results, stream).map((r) => ({ gender: r.s.gender, scores: r.sc })), max);
      const sum = rows.reduce((a, r) => ({ male: a.male + r.male, female: a.female + r.female, total: a.total + r.total }), { male: 0, female: 0, total: 0 });
      return <div key={stream} className="min-w-0">
        <div className="mb-2 text-sm font-semibold">{stream}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Total score (of {max}{sat ? ", SAT included" : ""})</th><th className="p-2">Male</th><th className="p-2">Female</th><th className="p-2">Total</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-border"><td className="p-2">{r.label}</td><td className="p-2 font-mono">{r.male}</td><td className="p-2 font-mono">{r.female}</td><td className="p-2 font-mono font-semibold text-primary">{r.total}</td></tr>)}
            <tr className="border-t border-border text-muted-foreground"><td className="p-2">Students with marks</td><td className="p-2 font-mono">{sum.male}</td><td className="p-2 font-mono">{sum.female}</td><td className="p-2 font-mono">{sum.total}</td></tr></tbody>
        </table></div>
      </div>;
    })}
  </div>;
}

function Matrix({ students, results, sat, round, onReset }: { students: DirStudent[]; results: DirResult[]; sat: boolean; round: number; onReset: (stream: string) => void }) {
  const [stream, setStream] = useState("Natural Science");
  const [section, setSection] = useState("all");
  const subjects = subjectsFor(stream, sat);
  const all = resultRows(students, results, stream);
  const sections = [...new Set(all.map((r) => r.s.section))].sort();
  const rows = rankRows(all.filter((r) => section === "all" || r.s.section === section).map((r) => ({ ...r, hasMarks: Object.keys(r.sc).length > 0 })));
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {STREAMS.map((x) => <Btn key={x} variant={stream === x ? "primary" : "ghost"} onClick={() => { setStream(x); setSection("all"); }}>{x}</Btn>)}
      <select aria-label="Section" className="field w-auto" value={section} onChange={(e) => setSection(e.target.value)}><option value="all">All sections</option>{sections.map((x) => <option key={x} value={x}>Section {x}</option>)}</select>
      <span className="ml-auto flex flex-wrap gap-2">
        <Btn variant="ghost" title={`Reset ${stream} results for this round`} aria-label={`Reset ${stream} results`} disabled={!all.some((r) => Object.keys(r.sc).length)} onClick={() => onReset(stream)}><RotateCcw className="h-4 w-4" />Reset results</Btn>
        <Btn variant="ghost" title="Download every student's results as Excel" onClick={() => downloadResults(students, results, sat, round, false)}><Download className="h-4 w-4" />Excel · all students</Btn>
        <Btn variant="ghost" title="Download results with one sheet per section" onClick={() => downloadResults(students, results, sat, round, true)}><Download className="h-4 w-4" />Excel · by section</Btn>
      </span>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Rank</th><th className="p-2">Student</th><th className="p-2">ID</th><th className="p-2">Sec</th>{subjects.map((x) => <th key={x} className="p-2">{x}</th>)}<th className="p-2">Total</th><th className="p-2">Avg</th></tr></thead>
      <tbody>{rows.map(({ s, sc, total, avg, rank }) => <tr key={s.student_code} className={`border-t border-border ${rank && rank <= 3 ? TOP[rank - 1]?.row ?? "" : ""}`}><td className="p-2"><RankBadge rank={rank} /></td><td className={`p-2 ${rank && rank <= 3 ? "font-semibold" : ""}`}>{s.full_name}</td><td className="p-2 font-mono text-xs">{s.student_code}</td><td className="p-2">{s.section}</td>{subjects.map((x) => <td key={x} className="p-2">{sc[x] ?? "—"}</td>)}<td className="p-2 font-semibold">{avg === null ? "—" : total}</td><td className="p-2 font-semibold text-primary">{avg ?? "—"}</td></tr>)}</tbody>
    </table>{!rows.length && <p className="py-6 text-center text-muted-foreground">No registered students here yet.</p>}</div>
  </div>;
}

const TOP = [
  { row: "bg-gold/15", text: "text-gold", label: "1st place" },
  { row: "bg-silver/10", text: "text-silver", label: "2nd place" },
  { row: "bg-bronze/15", text: "text-bronze", label: "3rd place" },
];
function RankBadge({ rank }: { rank: number | null }) {
  if (!rank) return <span className="text-muted-foreground">—</span>;
  if (rank > 3) return <span className="font-mono text-xs text-muted-foreground">{rank}</span>;
  const t = TOP[rank - 1];
  if (!t) return null;
  const Icon = rank === 1 ? Trophy : Medal;
  return <span className={`inline-flex items-center gap-1 font-mono text-xs font-bold ${t.text}`} title={t.label} aria-label={t.label}><Icon className="h-4 w-4" />{rank}</span>;
}

type ConnAttempt = { id: string; student_code: string; status: string; deadline_at: string | null; paused_at: string | null; pause_reason: string | null; last_seen_at: string | null; current_question: number };
function ConnectionLost({ attempts, nameOf, live, onResume }: { attempts: ConnAttempt[]; nameOf: (c: string) => string; live: boolean; onResume: (ids: string[]) => void }) {
  const lost = attempts.filter((a) => a.status === "in_progress" && a.pause_reason === "connection");
  if (!live) return null;
  const left = (a: ConnAttempt) => a.deadline_at && a.paused_at ? Math.max(0, Math.round((Date.parse(a.deadline_at) - Date.parse(a.paused_at)) / 1000)) : 0;
  const back = lost.filter((a) => backOnline(a.last_seen_at, a.paused_at));
  return <Panel className="mt-4" title={`Connection or power problems · ${lost.length}`} icon={<WifiOff className="h-4 w-4" />} action={back.length > 1 ? <Btn variant="accent" className="py-1 text-xs" onClick={() => onResume(back.map((a) => a.id))}><Play className="h-3.5 w-3.5" />Resume all back online ({back.length})</Btn> : undefined}>
    <p className="mb-3 text-xs text-muted-foreground">The moment a student's device loses power or internet, their exam is frozen — it is not submitted. Their answers, the question they were on and their time left are saved and the timer stops. You decide when they continue.</p>
    {!lost.length ? <p className="text-sm text-muted-foreground">Everyone is connected.</p> : <ul className="space-y-2 text-sm">
      {lost.map((a) => { const on = backOnline(a.last_seen_at, a.paused_at); return <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2">
        <span className="min-w-0 flex-1 break-words">{nameOf(a.student_code)} <span className="font-mono text-xs text-muted-foreground">{a.student_code}</span></span>
        <span className="text-xs text-muted-foreground">On question {a.current_question + 1} · lost at {a.paused_at ? new Date(a.paused_at).toLocaleTimeString() : "—"}</span>
        <span className="font-mono text-xs text-warning">{fmt(left(a))} left</span>
        <span className={`flex items-center gap-1 text-xs ${on ? "text-accent" : "text-muted-foreground"}`}>{on ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{on ? "Back online" : "Still offline"}</span>
        <Btn variant={on ? "accent" : "ghost"} className="py-1 text-xs" onClick={() => onResume([a.id])}><Play className="h-3.5 w-3.5" />Let them continue</Btn>
      </li>; })}
    </ul>}
  </Panel>;
}

type RoomStudent = DirStudent & { face_verified: boolean };
/** Exam room: only the students chosen here may start, so a class can sit the exam group by group. */
function ExamRoom({ students, attempts, selected, live, autoSchedule, autoCompleted, onSave }: { students: RoomStudent[]; attempts: { student_code: string; status: string }[]; selected: string[] | null; live: boolean; autoSchedule: boolean; autoCompleted: boolean; onSave: (codes: string[] | null) => Promise<void> }) {
  const [stream, setStream] = useState<string>("Natural Science");
  const [section, setSection] = useState("all");
  const [size, setSize] = useState(30);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected ?? []));
  const [dirty, setDirty] = useState(false);
  const savedKey = (selected ?? []).join(",");
  const [lastKey, setLastKey] = useState(savedKey);
  if (!dirty && lastKey !== savedKey) { setLastKey(savedKey); setPicked(new Set(selected ?? [])); }
  const status = new Map(attempts.map((a) => [a.student_code, a.status]));
  const verified = students.filter((x) => x.face_verified);
  const inStream = verified.filter((x) => x.stream === stream);
  const sections = [...new Set(inStream.map((x) => x.section))].sort();
  const list = inStream.filter((x) => (section === "all" || x.section === section) && matchesPerson(q, { name: x.full_name, id: x.student_code }));
  const change = (next: Set<string>) => { setPicked(next); setDirty(true); };
  const toggle = (code: string) => { const n = new Set(picked); if (n.has(code)) n.delete(code); else n.add(code); change(n); };
  const pickNext = () => {
    const n = new Set([...picked].filter((c) => !inStream.some((x) => x.student_code === c)));
    list.filter((x) => !status.has(x.student_code) || status.get(x.student_code) === "in_progress").slice(0, Math.max(1, size)).forEach((x) => n.add(x.student_code));
    change(n);
  };
  const count = (st: string) => [...picked].filter((c) => verified.some((x) => x.student_code === c && x.stream === st)).length;
  return <Panel className="mt-4" title={`Exam room · ${selected === null ? "everyone may start" : `${selected.length} admitted`}`} icon={<Users className="h-4 w-4" />}>
    <p className="mb-3 text-xs text-muted-foreground">Choose who may start the exam, for example by room size. Students not on the list cannot start. When this group has submitted, pick the next group.{!autoSchedule && autoCompleted ? " The exam closed itself because everyone submitted — admit the next group, then open the session again." : ""}</p>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {STREAMS.map((x) => <Btn key={x} variant={stream === x ? "primary" : "ghost"} className="px-3" onClick={() => { setStream(x); setSection("all"); }}>{x.split(" ")[0]} <span className="font-mono text-xs opacity-80">{count(x)}</span></Btn>)}
      <select aria-label="Room section" className="field w-auto" value={section} onChange={(e) => setSection(e.target.value)}><option value="all">All sections</option>{sections.map((x) => <option key={x} value={x}>Section {x}</option>)}</select>
      <div className="relative w-full sm:w-56"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Search room students" className="field pl-9" placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    </div>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">Room size<input type="number" min={1} max={500} aria-label="Room size" className="field w-20" value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
      <Btn variant="ghost" className="text-xs" onClick={pickNext}><Users className="h-3.5 w-3.5" />Select next {size || 1}</Btn>
      <Btn variant="ghost" className="text-xs" onClick={() => change(new Set([...picked].filter((c) => !inStream.some((x) => x.student_code === c))))}>Clear {stream.split(" ")[0]}</Btn>
      <span className="ml-auto flex flex-wrap gap-2">
        <Btn variant="ghost" className="text-xs" disabled={selected === null && !dirty} onClick={async () => { await onSave(null); setPicked(new Set()); setDirty(false); }}>Allow everyone</Btn>
        <Btn className="text-xs" disabled={!picked.size || (!dirty && selected !== null)} onClick={async () => { await onSave([...picked]); setDirty(false); }}><CheckCircle2 className="h-3.5 w-3.5" />Save room list ({picked.size})</Btn>
      </span>
    </div>
    {live && dirty && <p className="mb-2 text-xs text-warning">Changes apply as soon as you save. Students already writing keep going.</p>}
    <ul className="grid max-h-80 gap-1 overflow-y-auto text-sm sm:grid-cols-2 lg:grid-cols-3">
      {list.map((x) => { const st = status.get(x.student_code); return <li key={x.student_code}>
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 ${picked.has(x.student_code) ? "border-primary bg-primary/10" : "border-border"}`}>
          <input type="checkbox" checked={picked.has(x.student_code)} onChange={() => toggle(x.student_code)} aria-label={`Admit ${x.full_name}`} />
          <span className="min-w-0 flex-1"><span className="block truncate">{x.full_name}</span><span className="font-mono text-xs text-muted-foreground">{x.student_code} · {x.section}</span></span>
          {st && <span className={`shrink-0 text-xs ${st === "in_progress" ? "text-primary" : st === "blocked" ? "text-destructive" : "text-accent"}`}>{st === "in_progress" ? "writing" : st === "blocked" ? "blocked" : "done ✓"}</span>}
        </label>
      </li>; })}
      {!list.length && <li className="text-muted-foreground">No verified students here yet.</li>}
    </ul>
  </Panel>;
}

type DirAttempt = { id: string; student_code: string; status: string; deadline_at: string | null; paused_at: string | null };
function StudentTime({ pass, live, attempts, nameOf, onAct }: { pass: string; live: boolean; attempts: DirAttempt[]; nameOf: (c: string) => string; onAct: (fn: () => Promise<unknown>) => Promise<void> }) {
  const change = useServerFn(directorStudentTime);
  const [q, setQ] = useState("");
  const [mins, setMins] = useState(10);
  const active = attempts.filter((a) => a.status === "in_progress");
  const matches = q.trim() ? active.filter((a) => `${nameOf(a.student_code)} ${a.student_code}`.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const left = (a: DirAttempt) => a.deadline_at ? Math.max(0, Math.round((Date.parse(a.deadline_at) - (a.paused_at ? Date.parse(a.paused_at) : Date.now())) / 1000)) : 0;
  return <Panel className="mt-4" title="Individual student time" icon={<Timer className="h-4 w-4" />}>
    <p className="mb-3 text-xs text-muted-foreground">If a student is sick or has a problem, find them by name to add minutes or pause their timer. Only that student is affected.</p>
    {!live ? <p className="text-sm text-muted-foreground">Exam is not live.</p> : <>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Search student taking the exam" className="field pl-9" placeholder="Search student name or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Minutes<input type="number" min={1} max={180} aria-label="Minutes to add" className="field w-20" value={mins} onChange={(e) => setMins(Number(e.target.value))} /></label>
      </div>
      <ul className="space-y-2 text-sm">
        {matches.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
          <span className="min-w-0 flex-1 break-words">{nameOf(a.student_code)} <span className="font-mono text-xs text-muted-foreground">{a.student_code}</span></span>
          <span className={`font-mono text-xs ${a.paused_at ? "text-warning" : "text-primary"}`}>{a.paused_at ? "Paused · " : ""}{fmt(left(a))} left</span>
          <Btn variant="ghost" className="py-1 text-xs" onClick={() => onAct(() => change({ data: { passcode: pass, attemptId: a.id, action: "extend", minutes: mins } }))}><Plus className="h-3.5 w-3.5" />Add {mins} min</Btn>
          {a.paused_at
            ? <Btn variant="accent" className="py-1 text-xs" onClick={() => onAct(() => change({ data: { passcode: pass, attemptId: a.id, action: "resume" } }))}><Play className="h-3.5 w-3.5" />Resume</Btn>
            : <Btn variant="ghost" className="py-1 text-xs" onClick={() => onAct(() => change({ data: { passcode: pass, attemptId: a.id, action: "pause" } }))}><Pause className="h-3.5 w-3.5" />Pause</Btn>}
        </li>)}
        {q.trim() && !matches.length && <li className="text-muted-foreground">No student with that name is taking the exam right now.</li>}
        {!q.trim() && !!active.filter((a) => a.paused_at).length && <li className="text-xs text-warning">Paused now: {active.filter((a) => a.paused_at).map((a) => nameOf(a.student_code)).join(", ")}</li>}
      </ul>
    </>}
  </Panel>;
}

function ChangePassword({ pass, onChanged }: { pass: string; onChanged: (p: string) => void }) {
  const change = useServerFn(directorChangePassword);
  const [cur, setCur] = useState(""); const [next, setNext] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <Panel title="My password" icon={<KeyRound className="h-4 w-4" />}>
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(""); setMsg("");
        try { await change({ data: { current: cur, next } }); onChanged(next); setMsg("Password changed — it is active right now."); setCur(""); setNext(""); }
        catch (e) { setErr(e instanceof Error ? e.message : "Could not change the password."); }
        finally { setBusy(false); }
      }}>
        <input type="password" autoComplete="current-password" className="field" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        <input type="password" autoComplete="new-password" className="field" placeholder="New password (min 4 characters)" value={next} onChange={(e) => setNext(e.target.value)} required minLength={4} maxLength={100} />
        {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
        {msg && <p role="status" className="text-xs text-accent">{msg}</p>}
        <Btn className="w-full" disabled={busy || !cur || next.length < 4}>{busy ? "Saving…" : "Change password"}</Btn>
        <p className="text-xs text-muted-foreground">The new password works immediately. If you forget it, IT Admin can reset it.</p>
      </form>
    </Panel>
  );
}

function sessionDesc(s: { examLive: boolean; autoSchedule: boolean; autoClose: boolean; autoCompleted: boolean }) {
  if (!s.examLive) return s.autoCompleted ? "Closed automatically — every admitted student submitted" : "Closed — active exams auto-submit";
  if (s.autoSchedule) return "Open on schedule. After the last start time it stays open for students with extra or paused time, then closes by itself";
  if (s.autoClose) return "Open — closes by itself after every admitted student submits, including students given extra time";
  return "Students can start";
}

function Row({ label, desc, children }: { label: React.ReactNode; desc: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted-foreground">{desc}</div></div>{children}</div>;
}

function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function Schedule({ start, close, duration, disabled, onSave }: { start: string | null; close: string | null; duration: number; disabled: boolean; onSave: (v: { scheduledStart: string; scheduledClose: string; durationMin: number }) => Promise<void> }) {
  const [opens, setOpens] = useState(localDate(start));
  const [closes, setCloses] = useState(localDate(close));
  const [minutes, setMinutes] = useState(duration);
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (opens && closes) onSave({ scheduledStart: new Date(opens).toISOString(), scheduledClose: new Date(closes).toISOString(), durationMin: minutes }); }}>
    <label className="block text-xs text-muted-foreground">Opening date & time<input aria-label="Opening date and time" type="datetime-local" className="field mt-1" value={opens} onChange={e => setOpens(e.target.value)} disabled={disabled} required /></label>
    <label className="block text-xs text-muted-foreground">Closing date & time<input aria-label="Closing date and time" type="datetime-local" className="field mt-1" value={closes} onChange={e => setCloses(e.target.value)} disabled={disabled} required /></label>
    <label className="block text-xs text-muted-foreground">Student duration (minutes)<input aria-label="Student duration" type="number" min={5} max={600} className="field mt-1" value={minutes} onChange={e => setMinutes(Number(e.target.value))} disabled={disabled} required /></label>
    <Btn className="w-full" disabled={disabled}>Save schedule</Btn>
  </form>;
}
