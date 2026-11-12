import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Maximize, Flag, ChevronLeft, ChevronRight, AlertTriangle, Trophy, LogOut, ShieldCheck, UserPlus, LogIn, BadgeCheck, Copy, ClipboardList, BarChart3, WifiOff, KeyRound, LifeBuoy, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Shell, Panel, Btn } from "@/components/Shell";
import { LiveCamera } from "@/components/LiveCamera";
import { MathText, PassageBox, FigureImage } from "@/components/MathText";
import { canTakeStream } from "@/lib/admin-rules";
import { fmt } from "@/lib/identity";
import { HEARTBEAT_MS, HELP_COOLDOWN_SEC } from "@/lib/exam-timing";
import { enterFullscreen, exitFullscreen, inFullscreen, fullscreenSupported, FULLSCREEN_EVENTS } from "@/lib/fullscreen";
import { usePublicState } from "@/lib/live";
import { studentExam, studentSync, studentFlag, studentResults, studentHelp } from "@/lib/exam.functions";
import { registerStudent, loginStudent, checkRegistrationName, studentPing, studentSignOut, type PublicStudent } from "@/lib/students.functions";

export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "Student Portal — Burka Harbu Exams" },
      { name: "description", content: "Register with live photo verification, sit secure Grade 12 mock exams and check your results." },
      { property: "og:title", content: "Student Portal — Burka Harbu Exams" },
      { property: "og:description", content: "Secure mock exams and private scorecards for Burka Harbu students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentPage,
});

const SESSION = "bhss-student-session";

function StudentPage() {
  const [student, setStudent] = useState<PublicStudent | null>(null);
  const [mode, setMode] = useState<"home" | "exam" | "results">("home");
  const [gate, setGate] = useState<"choose" | "login" | "register">("choose");
  const login = useServerFn(loginStudent);
  const ping = useServerFn(studentPing);
  const leave = useServerFn(studentSignOut);
  const [notice, setNotice] = useState("");
  const { data: pub } = usePublicState();
  const regClosed = !pub || !pub.registrationOpen;

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION);
    if (!raw) return;
    const { name, id, token } = JSON.parse(raw) as { name: string; id: string; token?: string };
    login({ data: { name, id, token } }).then((r) => { if (r.ok) signIn(r.student); else { sessionStorage.removeItem(SESSION); setNotice(r.error); } }).catch(() => {});
  }, []);

  const signIn = (s: PublicStudent) => { sessionStorage.setItem(SESSION, JSON.stringify({ name: s.name, id: s.id, token: s.sessionToken })); setStudent(s); setNotice(""); };
  const signOut = (msg = "") => {
    if (student?.sessionToken) leave({ data: { id: student.id, token: student.sessionToken } }).catch(() => {});
    sessionStorage.removeItem(SESSION); setStudent(null); setMode("home"); setGate("choose"); setNotice(msg);
  };
  useEffect(() => {
    if (!student?.sessionToken) return;
    const token = student.sessionToken;
    const t = setInterval(() => {
      ping({ data: { id: student.id, token } }).then((r) => {
        if (!r.active) { sessionStorage.removeItem(SESSION); setStudent(null); setMode("home"); setGate("choose"); setNotice("You were signed out because this ID was signed in on another device."); }
      }).catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, [student?.id, student?.sessionToken]);

  if (!student) return (
    <Shell title="Student Portal" subtitle="Register once with a live photo, then sign in with your name and ID" help>
      {notice && <p role="alert" className="mx-auto mb-4 max-w-xl rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-center text-sm text-destructive">{notice}</p>}
      {gate === "choose" && (
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-4">
          <button onClick={() => setGate("register")} className="tile tile-hover relative text-left"><span className="tile-icon">{regClosed ? <Lock className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}</span><div className="mt-4 text-lg font-semibold">Register</div><div className="text-sm text-muted-foreground">{regClosed ? "Closed by IT Admin" : "New student · live photo"}</div>{regClosed && <span className="absolute right-3 top-3 rounded-full border border-border bg-secondary/60 p-1.5"><Lock className="h-3.5 w-3.5 text-muted-foreground" /></span>}</button>
          <button onClick={() => setGate("login")} className="tile tile-hover text-left"><span className="tile-icon"><LogIn className="h-5 w-5" /></span><div className="mt-4 text-lg font-semibold">Sign in</div><div className="text-sm text-muted-foreground">Name + student ID</div></button>
        </div>
      )}
      {gate === "login" && <Login onLogin={signIn} onBack={() => setGate("choose")} />}
      {gate === "register" && (regClosed ? (
        <div className="tile mx-auto max-w-sm space-y-4 text-center">
          <img src="/school-logo.jpg" alt="Burka Harbu logo" className="mx-auto h-20 w-20 rounded-full ring-2 ring-primary/40 glow" />
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary/60"><Lock className="h-6 w-6 text-muted-foreground" /></span>
          <h2 className="text-xl font-semibold">Registration is closed</h2>
          <p className="text-sm text-muted-foreground">New registrations are locked right now. Please contact IT Admin if you need to register.</p>
          <Btn variant="ghost" className="w-full" onClick={() => setGate("choose")}>← Back</Btn>
        </div>
      ) : <Register onDone={signIn} onBack={() => setGate("choose")} />)}
    </Shell>
  );
  if (mode === "exam") return <Exam student={student} onExit={() => setMode("home")} />;
  const first = student.name.split(" ")[0];
  return (
    <Shell title="Student Portal" subtitle="Burka Harbu Special Secondary School · Exam Portal" help>
      <div className="tile mb-4 flex flex-wrap items-center gap-3 sm:mb-6 sm:gap-5">
        {student.photoUrl ? <img src={student.photoUrl} alt={student.name} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-primary/50 glow sm:h-24 sm:w-24" /> : <div className="tile-icon h-16 w-16 sm:h-24 sm:w-24" />}
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-2xl font-bold sm:text-3xl">Welcome, {first}!</h2>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">{student.verified && <BadgeCheck aria-label="Face verified" className="verified-badge h-4 w-4" />}{student.id} · Grade {student.grade}{student.section} · {student.stream}</div>
        </div>
        <Btn variant="ghost" onClick={() => signOut()}><LogOut className="h-4 w-4" />Sign out</Btn>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 sm:gap-4">
        <button onClick={() => setMode("home")} className={`tile tile-hover text-left ${mode === "home" ? "tile-active" : ""}`}><span className="tile-icon"><ClipboardList className="h-5 w-5" /></span><div className="mt-3 font-semibold">Exams</div><div className="text-sm text-muted-foreground">Scheduled tests</div></button>
        <button onClick={() => setMode("results")} className={`tile tile-hover text-left ${mode === "results" ? "tile-active" : ""}`}><span className="tile-icon"><BarChart3 className="h-5 w-5" /></span><div className="mt-3 font-semibold">My results</div><div className="text-sm text-muted-foreground">Official scorecard</div></button>
      </div>
      {mode === "home" ? <ExamLobby stream={student.stream} onStart={() => setMode("exam")} /> : <Results student={student} />}
    </Shell>
  );
}

function Login({ onLogin, onBack }: { onLogin: (s: PublicStudent) => void; onBack: () => void }) {
  const login = useServerFn(loginStudent);
  const [name, setName] = useState(""); const [id, setId] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <form className="tile mx-auto max-w-sm space-y-3 text-center" onSubmit={async (e) => {
      e.preventDefault(); setErr(""); setBusy(true);
      try { const r = await login({ data: { name, id } }); r.ok ? onLogin(r.student) : setErr(r.error); }
      catch { setErr("Could not sign in. Check your details."); } finally { setBusy(false); }
    }}>
      <img src="/school-logo.jpg" alt="Burka Harbu logo" className="mx-auto h-20 w-20 rounded-full ring-2 ring-primary/40 glow" />
      <h2 className="font-semibold">Student sign in</h2>
      <input className="field" placeholder="Full name (as registered)" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="field font-mono uppercase" placeholder="Student ID e.g. BH-12A-4821" value={id} onChange={(e) => setId(e.target.value)} required />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Btn className="w-full" disabled={busy}>{busy ? "Checking…" : "Sign in"}</Btn>
      <button type="button" onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
    </form>
  );
}

function Register({ onDone, onBack }: { onDone: (s: PublicStudent) => void; onBack: () => void }) {
  const register = useServerFn(registerStudent);
  const checkName = useServerFn(checkRegistrationName);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [f, setF] = useState({ fullName: "", resultPin: "" });
  const [pin2, setPin2] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<PublicStudent | null>(null);

  if (step === 3 && issued) return (
    <div className="tile glow mx-auto max-w-sm space-y-4 text-center">
      <BadgeCheck className="mx-auto h-10 w-10 text-accent" />
      <h2 className="text-xl font-bold">You are verified!</h2>
      {issued.photoUrl && <img src={issued.photoUrl} alt={issued.name} className="mx-auto h-28 w-28 rounded-2xl object-cover ring-2 ring-primary/50" />}
      <div className="text-sm text-muted-foreground">{issued.name}</div>
      <div className="rounded-xl border border-primary/50 bg-primary/10 p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Your student ID</div>
        <div className="mt-1 font-mono text-3xl font-bold text-primary">{issued.id}</div>
      </div>
      <p className="text-xs text-warning">Write this ID down. You need your name and this ID to sign in.</p>
      <div className="flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={() => navigator.clipboard?.writeText(issued.id)}><Copy className="h-4 w-4" />Copy</Btn>
        <Btn className="flex-1" onClick={() => onDone(issued)}>Continue</Btn>
      </div>
    </div>
  );

  return (
    <div className="tile mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={step === 1 ? "text-primary" : ""}>1 · Details</span><span>—</span><span className={step === 2 ? "text-primary" : ""}>2 · Live photo</span><span>—</span><span>3 · Your ID</span></div>
      {step === 1 ? (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setErr("");
          if (!/^\d{4,6}$/.test(f.resultPin)) return setErr("Your result passcode must be 4 to 6 numbers.");
          if (f.resultPin !== pin2) return setErr("The two passcodes do not match.");
          setBusy(true);
          try { await checkName({ data: { name: f.fullName } }); setStep(2); }
          catch (e) { setErr(e instanceof Error ? e.message : "Could not check your name."); }
          finally { setBusy(false); }
        }}>
          <img src="/school-logo.jpg" alt="Burka Harbu logo" className="mx-auto h-20 w-20 rounded-full ring-2 ring-primary/40 glow" />
          <h2 className="text-lg font-semibold">Student registration</h2>
          <input className="field" placeholder="Full name as in the school list" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} maxLength={100} required />
          <label className="block text-xs text-muted-foreground">Result passcode (4–6 numbers)
            <input className="field mt-1 font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,6}" maxLength={6} placeholder="e.g. 4821" value={f.resultPin} onChange={(e) => setF({ ...f, resultPin: e.target.value.replace(/\D/g, "") })} required aria-label="Result passcode" />
          </label>
          <input className="field font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="Type the passcode again" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} required aria-label="Confirm result passcode" />
          <p className="text-xs text-warning">Remember this passcode — you need it to open your results after they are published.</p>
          <p className="text-xs text-muted-foreground">Your class (Grade 12 A, B or C), stream and official ID come from the school list.</p>
          <p className="text-xs text-muted-foreground">For the live photo: remove masks, scarves over the face and sunglasses.</p>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Btn className="w-full" disabled={busy}>{busy ? "Checking name…" : "Next: live photo"}</Btn>
          <button type="button" onClick={onBack} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">← Back</button>
        </form>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Live verification</h2>
          <LiveCamera onCapture={setPhoto} />
          {err && <p className="text-center text-xs text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => setStep(1)}>Back</Btn>
            <Btn className="flex-1" disabled={!photo || busy} onClick={async () => {
              if (!photo) return;
              setBusy(true); setErr("");
              try { const s = await register({ data: { ...f, photo } }); setIssued(s); setStep(3); }
              catch (e) { setErr(e instanceof Error ? e.message : "Registration failed."); } finally { setBusy(false); }
            }}>{busy ? "Verifying…" : "Verify & get my ID"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}


function ExamLobby({ onStart, stream }: { onStart: () => void; stream: string }) {
  const { data: st } = usePublicState();
  const bank = st?.banks.find((b) => canTakeStream(stream, b.stream)) ?? null;
  // Students already inside the exam can continue after a reload even when the start window has passed; the server decides.
  const ok = !!st?.examLive && !!bank;
  return (
    <Panel title={`Scheduled exam · Round ${st?.round ?? "—"}`} icon={<ShieldCheck className="h-4 w-4" />}>
      {!bank ? <p className="text-sm text-muted-foreground">No exam scheduled.</p> : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-2xl font-bold">{bank.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{bank.subject} · {bank.count} questions · {bank.marks} marks · {st?.durationMin} minutes</div>
            {st?.scheduledStart && <div className="mt-2 text-sm text-muted-foreground">{new Date(st.scheduledStart).toLocaleString()} – {new Date(st.scheduledClose ?? st.scheduledStart).toLocaleString()}</div>}
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              <li>• The exam opens in fullscreen. Leaving it or switching windows is reported.</li>
              <li>• More than 3 violations auto-submits your exam and blocks you.</li>
              <li>• Your question and answer order is unique to you.</li>
              <li>• The exam submits automatically when time is up.</li>
            </ul>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border p-6">
            {!st?.examLive ? <p className="flex items-center gap-2 text-sm text-destructive"><Lock className="h-4 w-4" />The exam session is closed</p>
              : !st.clockRunning ? <p className="text-center text-sm text-warning">New starts are outside the scheduled window. If you already started, you can continue.</p>
              : <p className="text-sm text-accent">The exam is open.</p>}
            <Btn disabled={!ok} onClick={async () => { await enterFullscreen(); onStart(); }}><Maximize className="h-4 w-4" />Enter fullscreen & begin</Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

type Paper = Awaited<ReturnType<typeof studentExam>>;
function Exam({ student, onExit }: { student: PublicStudent; onExit: () => void }) {
  const load = useServerFn(studentExam);
  const sync = useServerFn(studentSync);
  const flagFn = useServerFn(studentFlag);
  const helpFn = useServerFn(studentHelp);
  const [help, setHelp] = useState<"idle" | "sending" | "sent">("idle");
  const who = { name: student.name, id: student.id, token: student.sessionToken ?? "" };
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  const goOffline = () => { offlineRef.current = true; setOffline(true); };
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [paper, setPaper] = useState<Paper | null>(null);
  const [err, setErr] = useState("");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [violations, setViolations] = useState(0);
  const [left, setLeft] = useState(0);
  const [isFs, setIsFs] = useState(true);
  const [fsOk, setFsOk] = useState(true);
  const [flagFor, setFlagFor] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [askSubmit, setAskSubmit] = useState(false);
  const [ended, setEnded] = useState<null | "submitted" | "blocked" | "timeup">(null);
  const answersRef = useRef(answers); answersRef.current = answers;
  const endedRef = useRef(ended); endedRef.current = ended;
  const idxRef = useRef(idx); idxRef.current = idx;
  const backupKey = useRef("");
  // Keep a copy on this device so a power cut or lost internet never loses answers or the current question.
  useEffect(() => {
    if (!backupKey.current || ended) return;
    try { localStorage.setItem(backupKey.current, JSON.stringify({ answers, idx })); } catch { /* storage full or blocked */ }
  }, [answers, idx, ended]);
  useEffect(() => { if (ended && backupKey.current) try { localStorage.removeItem(backupKey.current); } catch { /* ignore */ } }, [ended]);

  const push = async (extra: { violation?: "fullscreen" | "focus"; submit?: boolean } = {}) => {
    if (endedRef.current || !backupKey.current) return; // nothing to save until the exam has loaded
    if (typeof navigator !== "undefined" && !navigator.onLine) { goOffline(); return; }
    try {
      // After any loss of contact the server freezes the timer at the last moment it heard from this device.
      const wasOffline = offlineRef.current;
      const r = await sync({ data: { ...who, answers: answersRef.current, current: idxRef.current, ...(wasOffline ? { connectionLost: true } : extra) } });
      setErr(""); offlineRef.current = false; setOffline(false);
      setViolations(r.violations); setLeft(r.secondsLeft); setPaused(r.paused); setPauseReason(r.pauseReason);
      if (r.status !== "in_progress") {
        endedRef.current = r.status === "blocked" ? "blocked" : r.timeUp ? "timeup" : "submitted";
        setEnded(endedRef.current);
        exitFullscreen(); // the exam is over, so leaving fullscreen is no longer a violation
      }
    } catch (e) {
      const net = !navigator.onLine || !(e instanceof Error) || /fetch|network|load failed|failed to|timeout|aborted/i.test(e.message);
      if (net) goOffline();
      setErr(net ? "" : e instanceof Error ? e.message : "Could not save.");
    }
  };
  // Detect power/internet loss the instant the browser reports it, not after the next save.
  useEffect(() => {
    const down = () => goOffline();
    const up = () => { push(); };
    window.addEventListener("offline", down); window.addEventListener("online", up);
    return () => { window.removeEventListener("offline", down); window.removeEventListener("online", up); };
  }, []);

  useEffect(() => {
    load({ data: who }).then((p) => {
      setErr("");
      backupKey.current = `bh-exam-backup-${p.attemptId}`;
      let saved: { answers?: Record<string, number>; idx?: number } = {};
      try { saved = JSON.parse(localStorage.getItem(backupKey.current) ?? "{}"); } catch { /* ignore */ }
      const startAt = Math.min(Math.max(0, saved.idx ?? p.currentQuestion ?? 0), Math.max(0, p.paper.length - 1));
      // Fetch every picture now so they still show if the internet drops later in the exam.
      p.paper.forEach((q) => { if (q.figureUrl) { const img = new Image(); img.src = q.figureUrl; } });
      setPaper(p); setAnswers({ ...p.answers, ...(saved.answers ?? {}) }); setIdx(startAt); setViolations(p.violations); setLeft(p.secondsLeft); setPaused(p.paused); setPauseReason(p.pauseReason);
      if (p.attemptStatus === "blocked") setEnded("blocked"); else if (p.attemptStatus === "submitted") setEnded("submitted");
    }).catch((e) => setErr(e instanceof Error ? e.message : "Could not load the exam."));
  }, []);
  useEffect(() => { const t = setInterval(() => { if (!pausedRef.current && !offlineRef.current) setLeft((l) => Math.max(0, l - 1)); }, 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => push(), HEARTBEAT_MS); return () => clearInterval(t); }, []);
  useEffect(() => { if (paper && left === 0 && !ended && !offline) push(); }, [left, paper]);
  useEffect(() => {
    let last = 0;
    const hit = (kind: "fullscreen" | "focus") => { if (endedRef.current || pausedRef.current || offlineRef.current || Date.now() - last < 1500) return; last = Date.now(); push({ violation: kind }); };
    const blur = () => hit("focus");
    const vis = () => document.hidden && hit("focus");
    const supported = fullscreenSupported();
    setFsOk(supported); setIsFs(!supported || inFullscreen());
    const fs = () => { const on = inFullscreen(); setIsFs(on); if (!on) hit("fullscreen"); };
    // Any tap while the exam runs puts the screen straight back into fullscreen (browsers only allow this from a tap).
    const back = () => { if (supported && !endedRef.current && !inFullscreen()) enterFullscreen(); };
    window.addEventListener("blur", blur); document.addEventListener("visibilitychange", vis);
    FULLSCREEN_EVENTS.forEach((n) => document.addEventListener(n, fs));
    document.addEventListener("pointerdown", back, true);
    // Block copy / select-all / print / save shortcuts while the exam runs.
    const keys = (e: KeyboardEvent) => { if (!endedRef.current && (e.ctrlKey || e.metaKey) && ["c", "x", "a", "p", "s", "u"].includes(e.key.toLowerCase())) e.preventDefault(); };
    document.addEventListener("keydown", keys, true);
    return () => {
      document.removeEventListener("keydown", keys, true);
      window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", vis);
      FULLSCREEN_EVENTS.forEach((n) => document.removeEventListener(n, fs));
      document.removeEventListener("pointerdown", back, true);
    };
  }, []);
  const sendFlag = async () => {
    const id = flagFor; if (!id) return;
    setFlagFor(null);
    try { await flagFn({ data: { ...who, questionId: id, note: flagNote.trim() || undefined } }); setFlagged((f) => new Set(f).add(id)); } catch { setErr("Could not send the flag."); }
    setFlagNote("");
  };
  // One tap tells the Director who needs help (name, ID, class, subject, question). No pop-up, so fullscreen stays on.
  const askHelp = async () => {
    if (help !== "idle") return;
    setHelp("sending");
    try { await helpFn({ data: { ...who, question: idxRef.current + 1 } }); setHelp("sent"); setTimeout(() => setHelp("idle"), HELP_COOLDOWN_SEC * 1000); }
    catch (e) { setHelp("idle"); setErr(e instanceof Error ? e.message : "Could not send your help request. Raise your hand."); }
  };

  if (ended) return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass max-w-md p-8 text-center">
        {ended === "blocked" ? <AlertTriangle className="mx-auto h-12 w-12 text-destructive" /> : <ShieldCheck className="mx-auto h-12 w-12 text-accent" />}
        <h1 className="mt-4 text-2xl font-bold">{ended === "blocked" ? "You have been removed from the exam" : ended === "timeup" ? "Time is up!" : "Exam submitted"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{ended === "blocked" ? "You left the exam screen more than 3 times. Your answers were submitted. Only the Director can re-admit you." : "Your answers are sealed. Scores appear in “My results” once the Director publishes them."}</p>
        <Btn className="mt-6" onClick={onExit}>Back to portal</Btn>
      </div>
    </div>
  );
  if (!paper) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">{err ? <><p className="text-destructive">{err}</p><Btn onClick={onExit}>Back</Btn></> : <p className="text-muted-foreground">Loading exam…</p>}</div>;
  if (!paper.paper.length) return <div className="flex min-h-screen flex-col items-center justify-center gap-4"><p>This exam has no questions.</p><Btn onClick={onExit}>Back</Btn></div>;

  const cur = paper.paper[idx];
  if (!cur) return null;
  const answeredCount = Object.keys(answers).length;
  return (
    // The exam covers the whole screen on every device, including phones whose browser has no fullscreen mode.
    // Questions and choices cannot be selected, copied, cut, dragged or long-pressed during the exam.
    <div className="fixed inset-0 z-50 select-none overflow-y-auto overscroll-contain bg-background [-webkit-touch-callout:none]"
      onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3">
          <img src="/school-logo.jpg" alt="" className="h-9 w-9 rounded-full" />
          <div className="text-sm"><div className="font-semibold">{paper.title}</div><div className="text-xs text-muted-foreground">{student.id} · {answeredCount}/{paper.paper.length} answered</div></div>
          <span className={`rounded-full border border-border px-2.5 py-1 font-mono text-sm font-bold lg:hidden ${left < 300 ? "text-destructive" : "text-primary"}`} aria-label="Time left">{fmt(left)}</span>
          <span className={`ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${violations ? "border-destructive/50 text-destructive" : "border-accent/40 text-accent"}`}><AlertTriangle className="h-3.5 w-3.5" />{violations}/3 warnings</span>
          <Btn variant="ghost" className="px-3" disabled={help !== "idle"} onClick={askHelp} title="Ask the Director for help" aria-label="Ask the Director for help"><LifeBuoy className={`h-4 w-4 ${help === "sent" ? "text-accent" : "text-warning"}`} /><span>{help === "sent" ? "Help sent" : help === "sending" ? "Sending…" : "Help"}</span></Btn>
          <Btn variant="accent" onClick={() => setAskSubmit(true)}>Submit</Btn>
        </div>
        {help === "sent" && <p role="status" className="border-t border-border bg-accent/10 px-3 py-1.5 text-center text-xs text-accent">The Director has your name and ID and is coming to help. Stay in your seat — your time keeps running.</p>}
      </div>
      {paused && (
        <div role="dialog" aria-modal="true" aria-labelledby="paused-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="glass max-w-sm p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-warning" />
            <h2 id="paused-title" className="mt-3 text-xl font-bold">{pauseReason === "connection" ? "Your connection was lost" : "Your timer is paused"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{pauseReason === "connection"
              ? `Your exam was not submitted. Your answers, your place (question ${idx + 1}) and your remaining time (${fmt(left)}) are saved. The Director can see you are back — wait here until the Director lets you continue.`
              : `The Director paused your exam. Your answers and remaining time (${fmt(left)}) are saved. Wait here — it continues when the Director resumes it.`}</p>
          </div>
        </div>
      )}
      {offline && !paused && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="offline-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="glass max-w-sm p-6 text-center sm:p-8">
            <WifiOff className="mx-auto h-10 w-10 text-warning" />
            <h2 id="offline-title" className="mt-3 text-xl font-bold">No connection</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your timer is stopped and your exam is not submitted. Your answers, your place (question {idx + 1}) and your time ({fmt(left)}) are saved on this device. When the internet returns, the Director will let you continue.</p>
            <p className="mt-3 animate-pulse text-xs text-warning">Reconnecting…</p>
          </div>
        </div>
      )}
      {fsOk && !isFs && !paused && !offline && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="fs-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
          <div className="glass max-w-sm p-6 text-center sm:p-8">
            <Maximize className="mx-auto h-10 w-10 text-destructive" />
            <h2 id="fs-title" className="mt-3 text-xl font-bold">Fullscreen exited</h2>
            <p className="mt-2 text-sm text-muted-foreground">The exam must stay in fullscreen until it ends. Leaving it is reported to the Director. Your answers and time are safe.</p>
            <Btn className="mt-5 w-full" onClick={() => enterFullscreen()}><Maximize className="h-4 w-4" />Return to fullscreen</Btn>
          </div>
        </div>
      )}
      {flagFor && (
        <div role="dialog" aria-modal="true" aria-labelledby="flag-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-sm p-6">
            <h2 id="flag-title" className="flex items-center gap-2 text-lg font-bold"><Flag className="h-5 w-5 text-warning" />Report this question</h2>
            <label className="mt-3 block text-sm text-muted-foreground" htmlFor="flag-note">What is wrong with it? (optional)</label>
            <textarea id="flag-note" className="field mt-2 min-h-24 select-text" maxLength={300} value={flagNote} onChange={(e) => setFlagNote(e.target.value)} />
            <div className="mt-4 flex gap-2"><Btn variant="ghost" className="flex-1" onClick={() => { setFlagFor(null); setFlagNote(""); }}>Cancel</Btn><Btn className="flex-1" onClick={sendFlag}>Send report</Btn></div>
          </div>
        </div>
      )}
      {askSubmit && (
        <div role="dialog" aria-modal="true" aria-labelledby="submit-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-sm p-6 text-center">
            <h2 id="submit-title" className="text-lg font-bold">Submit your exam now?</h2>
            <p className="mt-2 text-sm text-muted-foreground">{paper.paper.length - answeredCount} question(s) unanswered. You cannot change answers after submitting.</p>
            <div className="mt-5 flex gap-2"><Btn variant="ghost" className="flex-1" onClick={() => setAskSubmit(false)}>Keep working</Btn><Btn variant="accent" className="flex-1" onClick={() => { setAskSubmit(false); push({ submit: true }); }}>Submit</Btn></div>
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-[1fr_260px]">
        <div className="glass p-4 sm:p-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Question {idx + 1} of {paper.paper.length}</span><span>{cur.marks} mark{cur.marks > 1 ? "s" : ""}</span></div>
          {cur.passage && <PassageBox key={`p-${cur.id}`} text={cur.passage} className="mt-3" />}
          <h2 className="mt-3 break-words text-lg font-semibold leading-relaxed sm:text-xl"><MathText text={cur.text} /></h2>
          {cur.figureUrl && <FigureImage src={cur.figureUrl} className="mt-3" />}
          <div className="mt-6 space-y-3">
            {cur.choices.map((c, k) => {
              const sel = answers[cur.id] === c.value;
              return (
                <button key={c.value} onClick={() => setAnswers({ ...answers, [cur.id]: c.value })} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition sm:p-4 ${sel ? "border-primary bg-primary/10 glow" : "border-border hover:border-primary/50"}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono text-sm ${sel ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{"ABCD"[k]}</span>
                  <span className="min-w-0 flex-1"><MathText text={c.label ?? ""} /></span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Btn variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-4 w-4" />Prev</Btn>
            <Btn variant="ghost" disabled={flagged.has(cur.id)} onClick={() => setFlagFor(cur.id)}><Flag className={`h-4 w-4 ${flagged.has(cur.id) ? "text-warning" : ""}`} />{flagged.has(cur.id) ? "Reported" : "Report question"}</Btn>
            <Btn className="ml-auto" disabled={idx === paper.paper.length - 1} onClick={() => setIdx(idx + 1)}>Next<ChevronRight className="h-4 w-4" /></Btn>
          </div>
        </div>
        <div className="glass h-fit p-4">
          <div className="mb-1 text-xs text-muted-foreground">Time left</div>
          <div className={`mb-4 font-mono text-3xl font-bold ${left < 300 ? "animate-pulse text-destructive" : "text-primary"}`}>{fmt(left)}</div>
          <div className="mb-3 text-sm font-semibold">Navigator</div>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
            {paper.paper.map((p, i) => {
              const a = answers[p.id] !== undefined, f = flagged.has(p.id);
              return <button key={p.id} onClick={() => setIdx(i)} className={`relative h-10 rounded-lg border font-mono text-sm ${i === idx ? "ring-2 ring-primary" : ""} ${a ? "border-accent bg-accent/20 text-accent" : "border-border bg-muted/50"}`}>{i + 1}{f && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning" />}</button>;
            })}
          </div>
          {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
        </div>
      </div>
    </div>
  );
}

function Results({ student }: { student: PublicStudent }) {
  const fn = useServerFn(studentResults);
  const [round, setRound] = useState<number | undefined>();
  const [pin, setPin] = useState(""); const [typed, setTyped] = useState(""); const [typed2, setTyped2] = useState("");
  const { data, error } = useQuery({ queryKey: ["results", student.id, round, pin], queryFn: () => fn({ data: { name: student.name, id: student.id, token: student.sessionToken ?? "", round, pin: pin || undefined } }), refetchInterval: 4000, retry: false });
  // When the Director adds marks for a flagged question, the scorecard refreshes by itself and says so.
  const lastScores = useRef<{ round: number; scores: Record<string, number> } | null>(null);
  const [raised, setRaised] = useState<string[]>([]);
  useEffect(() => {
    if (!data?.published || data.locked) return;
    const now = data.scores as Record<string, number>;
    const prev = lastScores.current;
    if (prev && prev.round === data.round) {
      const up = Object.keys(now).filter((k) => prev.scores[k] !== undefined && (now[k] ?? 0) > (prev.scores[k] ?? 0));
      if (up.length) { setRaised(up); setTimeout(() => setRaised([]), 15000); }
    }
    lastScores.current = { round: data.round, scores: now };
  }, [data]);
  if (error && pin) return <PinForm mode="enter" err={error instanceof Error ? error.message : "Wrong result passcode."} typed={typed} setTyped={setTyped} typed2={typed2} setTyped2={setTyped2} onSubmit={(p) => setPin(p)} />;
  if (!data) return <p className="text-muted-foreground">{error ? (error instanceof Error ? error.message : "Could not load results.") : "Loading…"}</p>;
  if (data.published && data.locked) return <PinForm mode={data.locked} err="" typed={typed} setTyped={setTyped} typed2={typed2} setTyped2={setTyped2} onSubmit={(p) => setPin(p)} />;
  if (!data.published) return (
    <Panel title="Results locked" icon={<Lock className="h-4 w-4" />}>
      <div className="py-10 text-center"><Lock className="mx-auto h-12 w-12 text-muted-foreground" /><p className="mt-3 text-muted-foreground">Results have not been officially announced yet. Please check back later.</p></div>
    </Panel>
  );
  const subs = data.subjects;
  const mine = data.scores as Record<string, number>;
  const taken = subs.filter((x) => mine[x] !== undefined);
  const total = taken.reduce((a, x) => a + (mine[x] ?? 0), 0);
  const max = taken.length * 100;
  return (
    <div className="tile glow">
      {!!raised.length && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent"><Sparkles className="h-4 w-4 shrink-0" />Your marks were updated by the Director: {raised.join(", ")}.</p>}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Exam round</span>
        {(data.rounds.length ? data.rounds : [data.round]).map((r) => <Btn key={r} variant={r === data.round ? "primary" : "ghost"} className="py-1" onClick={() => setRound(r)}>Round {r}</Btn>)}
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:gap-5">
        {student.photoUrl && <img src={student.photoUrl} alt={student.name} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-primary/50 sm:h-24 sm:w-24" />}
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-widest text-primary">Official scorecard · Round {data.round}</div>
          <h2 className="flex flex-wrap items-center gap-2 break-words text-xl font-bold sm:text-2xl">{student.name}{student.verified && <BadgeCheck aria-label="Face verified" className="verified-badge h-5 w-5" />}</h2>
          <div className="text-sm text-muted-foreground">{student.id} · Grade {student.grade}{student.section} · {student.stream}</div>
        </div>
        <div className="text-center"><Trophy className="mx-auto h-8 w-8 text-warning" /><div className="font-display text-2xl font-bold">{taken.length}/{subs.length}</div><div className="text-xs text-muted-foreground">subjects graded</div></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {subs.map((sub) => { const v = mine[sub]; return (
          <div key={sub} className="rounded-2xl border border-border bg-secondary/30 p-3 sm:p-4">
            <div className="flex flex-wrap justify-between gap-1 text-sm"><span>{sub}</span><span className="font-mono font-semibold">{v === undefined ? "—" : `${v}/100`}</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${(v ?? 0) >= 50 ? "bg-accent" : "bg-destructive"}`} style={{ width: `${v ?? 0}%` }} /></div>
          </div>
        ); })}
        <div className="col-span-2 rounded-2xl border border-primary/50 bg-primary/10 p-4 lg:col-span-1">
          <div className="text-sm text-muted-foreground">Total</div><div className="font-display text-2xl font-bold">{total}/{max || 0}</div><div className="text-sm text-primary">{max ? ((total / max) * 100).toFixed(1) : "0.0"}%</div>
        </div>
      </div>
    </div>
  );
}

function PinForm({ mode, err, typed, setTyped, typed2, setTyped2, onSubmit }: { mode: "enter" | "create"; err: string; typed: string; setTyped: (v: string) => void; typed2: string; setTyped2: (v: string) => void; onSubmit: (pin: string) => void }) {
  const [local, setLocal] = useState("");
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  return (
    <Panel title="Results are published" icon={<KeyRound className="h-4 w-4" />}>
      <form className="mx-auto max-w-xs space-y-3 py-6 text-center" onSubmit={(e) => {
        e.preventDefault(); setLocal("");
        if (!/^\d{4,6}$/.test(typed)) return setLocal("Your result passcode must be 4 to 6 numbers.");
        if (mode === "create" && typed !== typed2) return setLocal("The two passcodes do not match.");
        onSubmit(typed);
      }}>
        <Lock className="mx-auto h-10 w-10 text-primary" />
        <p className="text-sm text-muted-foreground">{mode === "enter" ? "Enter the result passcode you chose at registration to open your results." : "You registered before result passcodes existed. Choose a passcode of 4–6 numbers now — you will need it every time you open your results."}</p>
        <input className="field text-center font-mono text-lg tracking-[0.5em]" type="password" inputMode="numeric" autoComplete={mode === "enter" ? "current-password" : "new-password"} aria-label="Result passcode" placeholder="••••" value={typed} onChange={(e) => setTyped(digits(e.target.value))} required />
        {mode === "create" && <input className="field text-center font-mono text-lg tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="new-password" aria-label="Confirm result passcode" placeholder="Again" value={typed2} onChange={(e) => setTyped2(digits(e.target.value))} required />}
        {(local || err) && <p role="alert" className="text-xs text-destructive">{local || err}</p>}
        <Btn className="w-full">{mode === "enter" ? "Unlock my results" : "Save passcode & open results"}</Btn>
      </form>
    </Panel>
  );
}
