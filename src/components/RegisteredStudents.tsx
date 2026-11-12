import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { ScanFace, Trash2, RefreshCw, Pencil, Download, LockKeyhole, Search, X, Save, Users, BookOpen, Copy, BadgeCheck, KeyRound, Upload, UserPlus, RotateCcw } from "lucide-react";
import { Btn, Avatar } from "@/components/Shell";
import { adminDirectory, adminDeleteStudent, adminEditName, adminEditStudent, adminSetRegistration, adminUploadRoster, adminAddRosterStudent, adminResetFace, adminDeletePerson, adminEditTeacher, adminResetResultPin, adminSetStaffVisibility } from "@/lib/students.functions";
import { academicYear, SUBJECTS, STAFF_PAGES, RESULT_PIN, matchesClassFilter, classFilterOptions, type TeacherDetails, type StudentDetails } from "@/lib/admin-rules";
import { EyeOff, Eye } from "lucide-react";
import { adminResetStaffPassword } from "@/lib/exam.functions";
import { matchesPerson } from "@/lib/results";
import { TeacherRosterTools } from "@/components/TeacherRosterTools";
import { Toggle } from "@/components/Shell";
import { TelegramBotPanel } from "@/components/TelegramBotPanel";
import { Bot } from "lucide-react";

type Directory = Awaited<ReturnType<typeof adminDirectory>>;
const PAGE_LABEL: Record<string, string> = { director: "Director", "it-admin": "IT Admin", teacher: "Teachers" };
type Person = { verified?: boolean; id: string; name: string; grade: string; section: string; stream: string; gender: string; subjects: string[]; photoUrl: string | null; createdAt: string | null; target: "roster" | "registered"; kind: "student" | "teacher"; batch?: string | undefined };
/** ISO time → value for a datetime-local input, in the viewer's own time zone. */
const toLocalInput = (v: string | null) => { if (!v) return ""; const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const showDate = (v: string | null, time = false) => v ? new Date(v).toLocaleString(undefined, time ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "short", day: "numeric" }) : "—";
type RosterRow = { full_name: string; grade: string; section: string; stream: "Natural Science" | "Social Science"; gender: "M" | "F" };

/** Parse an Excel/CSV student list. Expected columns: Name, Grade, Section, Stream, Gender. */
function parseRosterFile(buf: ArrayBuffer): RosterRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  const sheet = first ? wb.Sheets[first] : undefined;
  if (!sheet) throw new Error("The file has no sheets.");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const pick = (r: Record<string, unknown>, ...keys: string[]) => {
    for (const k of Object.keys(r)) if (keys.includes(k.trim().toLowerCase())) return String(r[k] ?? "").trim();
    return "";
  };
  const rows: RosterRow[] = [];
  const problems: string[] = [];
  raw.forEach((r, i) => {
    const name = pick(r, "name", "full name", "full_name", "student name");
    if (!name) return; // skip blank rows
    const grade = pick(r, "grade", "class") || "12";
    const section = pick(r, "section", "sec").toUpperCase();
    const streamRaw = pick(r, "stream").toLowerCase();
    const stream = streamRaw.startsWith("soc") ? "Social Science" : streamRaw.startsWith("nat") ? "Natural Science" : null;
    const genderRaw = pick(r, "gender", "sex").toLowerCase();
    const gender = genderRaw.startsWith("f") ? "F" : genderRaw.startsWith("m") ? "M" : null;
    if (name.length < 3 || !section || !stream || !gender) { problems.push(`Row ${i + 2}: ${name || "?"}`); return; }
    rows.push({ full_name: name, grade, section, stream, gender });
  });
  if (!rows.length) throw new Error("No valid students found. Use columns: Name, Grade, Section, Stream, Gender.");
  if (problems.length) throw new Error(`Some rows are missing details: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? ` and ${problems.length - 5} more` : ""}. Fix the file and try again.`);
  return rows;
}

export function RegisteredStudents({ passcode, initial, onLock }: { passcode: string; initial: Directory; onLock: () => void }) {
  const load = useServerFn(adminDirectory);
  const edit = useServerFn(adminEditName);
  const remove = useServerFn(adminDeleteStudent);
  const setReg = useServerFn(adminSetRegistration);
  const resetPw = useServerFn(adminResetStaffPassword);
  const upload = useServerFn(adminUploadRoster);
  const addStudent = useServerFn(adminAddRosterStudent);
  const resetFace = useServerFn(adminResetFace);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingRows, setPendingRows] = useState<RosterRow[] | null>(null);
  const [batchName, setBatchName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newStudent, setNewStudent] = useState<RosterRow>({ full_name: "", grade: "12", section: "A", stream: "Natural Science", gender: "M" });
  const [staffMsg, setStaffMsg] = useState("");
  const [resetTeacher, setResetTeacher] = useState("");
  const [directory, setDirectory] = useState(initial);
  const [view, setView] = useState<"registered" | "students" | "teachers" | "bot">("registered");
  const [query, setQuery] = useState("");
  const [stream, setStream] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const removePerson = useServerFn(adminDeletePerson);
  const editTeacher = useServerFn(adminEditTeacher);
  const [details, setDetails] = useState<TeacherDetails | null>(null);
  const editStudent = useServerFn(adminEditStudent);
  const [studentDetails, setStudentDetails] = useState<(StudentDetails & { registeredLocal: string }) | null>(null);
  const resetPin = useServerFn(adminResetResultPin);
  const setVisibility = useServerFn(adminSetStaffVisibility);
  const [pinFor, setPinFor] = useState<Person | null>(null);
  const [newPin, setNewPin] = useState("");
  const hidden = directory.hiddenStaffRoles ?? [];
  const toggleHidden = async (page: (typeof STAFF_PAGES)[number], hide: boolean) => {
    const next = hide ? [...new Set([...hidden, page])] : hidden.filter((x) => x !== page);
    setError(""); setMessage("");
    try { await setVisibility({ data: { passcode, hidden: next as (typeof STAFF_PAGES)[number][] } }); setDirectory({ ...directory, hiddenStaffRoles: next }); setMessage(hide ? `${PAGE_LABEL[page]} is now hidden. Open it with its direct link: ${window.location.origin}/${page}` : `${PAGE_LABEL[page]} is visible on the home page again.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not change page visibility."); }
  };
  const people: Person[] = view === "registered" ? directory.registered.map((s) => ({ ...s, subjects: [], target: "registered", kind: "student", batch: directory.roster.find((r) => r.id === s.id)?.batch })) : directory.roster.filter((r) => r.kind === (view === "teachers" ? "teacher" : "student")).map((r) => { const reg = directory.registered.find((x) => x.id === r.id); return { id: r.id, name: r.full_name, grade: r.grade, section: r.section, stream: r.stream, gender: r.gender, subjects: r.subjects, photoUrl: reg?.photoUrl ?? null, verified: !!reg?.verified, createdAt: reg?.createdAt ?? null, target: "roster", kind: r.kind === "teacher" ? "teacher" : "student", batch: r.batch }; });
  const deletePerson = async (p: Person) => {
    if (!confirm(p.kind === "teacher" ? `Delete ${p.name} from the teacher list completely? Their question papers stay so saved marks are kept.` : `Delete ${p.name} (${p.id}) from the school list completely? Their registration, photo and all exam marks are permanently removed.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await removePerson({ data: { passcode, id: p.id } }); setSelected(null); await refresh(); setMessage(`${p.name} was removed.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove."); }
    finally { setBusy(false); }
  };
  const shown = people.filter((p) => matchesClassFilter(stream, p) && matchesPerson(query, p));
  const filterOptions = classFilterOptions(people);
  const picked = shown.find((p) => p.id === selected);
  const refresh = async () => {
    setBusy(true); setError("");
    try { setDirectory(await load({ data: { passcode } })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not refresh."); }
    finally { setBusy(false); }
  };
  const startEdit = (p: Person) => {
    setEditing(p); setName(p.name); setError(""); setMessage("");
    setDetails(p.kind === "teacher" ? { stream: (["Natural Science", "Social Science", "Both"].includes(p.stream) ? p.stream : "Natural Science") as TeacherDetails["stream"], grade: p.grade || "12", section: p.section, gender: p.gender === "F" ? "F" : "M", subjects: p.subjects.filter((x): x is TeacherDetails["subjects"][number] => (SUBJECTS as readonly string[]).includes(x)), batch: p.batch || academicYear() } : null);
    setStudentDetails(p.kind === "student" ? { grade: p.grade || "12", section: (p.section || "A").toUpperCase(), stream: p.stream === "Social Science" ? "Social Science" : "Natural Science", gender: p.gender === "F" ? "F" : "M", batch: p.batch || academicYear(), registeredLocal: toLocalInput(p.createdAt) } : null);
  };
  const exportRows = () => {
    const csv = (v: string) => `"${( /^[=+\-@\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""')}"`;
    const text = [["ID", "Name", "Stream", "Grade", "Section", "Gender", view === "teachers" ? "Subjects" : "Registered", "Batch"], ...shown.map((p) => [p.id, p.name, p.stream, p.grade, p.section, p.gender, view === "teachers" ? p.subjects.join("; ") : showDate(p.createdAt), p.batch ?? ""])].map((r) => r.map(csv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `burka-harbu-${view}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <div>
    <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-border pb-5">
      <div className="mr-auto flex flex-wrap gap-6 text-sm">
        <span><strong className="text-xl text-accent">{directory.registered.length}</strong> Registered</span>
        <span><strong className="text-xl text-primary">{directory.roster.filter((r) => r.kind === "student").length}</strong> School students</span>
        <span><strong className="text-xl">{directory.roster.filter((r) => r.kind === "teacher").length}</strong> Teachers</span>
      </div>
      <span className="flex items-center gap-2 text-sm">Registration {directory.registrationOpen ? "open" : "closed"}<Toggle label="Registration open" on={directory.registrationOpen} onChange={async (v) => { try { await setReg({ data: { passcode, open: v } }); setDirectory({ ...directory, registrationOpen: v }); } catch (e) { setError(e instanceof Error ? e.message : "Could not update."); } }} /></span>
      <Btn variant="ghost" onClick={refresh} disabled={busy} title="Refresh directory"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />Refresh</Btn>
      <Btn variant="ghost" onClick={onLock}><LockKeyhole className="h-4 w-4" />Lock</Btn>
    </div>
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
      <span className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" />Staff passwords</span>
      <span className="text-xs text-muted-foreground">Choose who forgot their password. Only that person's password changes.</span>
      <Btn variant="ghost" disabled={busy} onClick={async () => {
        if (!confirm("Reset the Director password? The old one stops working immediately.")) return;
        setBusy(true); setError(""); setStaffMsg("");
        try { const r = await resetPw({ data: { passcode, role: "director" } }); setStaffMsg(`New Director password: ${r.code} — shown once, give it to them now.`); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not reset the password."); }
        finally { setBusy(false); }
      }}><RefreshCw className="h-4 w-4" />Reset Director</Btn>
      <select aria-label="Teacher to reset" className="field w-auto max-w-full" value={resetTeacher} onChange={(e) => setResetTeacher(e.target.value)}>
        <option value="">Choose teacher…</option>
        {directory.roster.filter((r) => r.kind === "teacher").map((t) => <option key={t.id} value={t.id}>{t.full_name} ({t.id})</option>)}
      </select>
      <Btn variant="ghost" disabled={busy || !resetTeacher} onClick={async () => {
        const t = directory.roster.find((r) => r.id === resetTeacher);
        if (!t || !confirm(`Reset ${t.full_name}'s password? Only this teacher is affected; their old password stops working immediately.`)) return;
        setBusy(true); setError(""); setStaffMsg("");
        try { const r = await resetPw({ data: { passcode, role: "teacher", teacherId: t.id } }); setStaffMsg(`New password for ${t.full_name}: ${r.code} — shown once, give it to them now.`); setResetTeacher(""); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not reset the password."); }
        finally { setBusy(false); }
      }}><KeyRound className="h-4 w-4" />Reset teacher</Btn>
      {staffMsg && <span role="status" className="w-full font-mono text-sm text-accent">{staffMsg}</span>}
    </div>
    <div className="mb-6 rounded-xl border border-border p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><EyeOff className="h-4 w-4 text-primary" />Hide staff pages</div>
      <p className="mb-3 text-xs text-muted-foreground">Hidden pages disappear from the home page and every menu. They still open from their direct link (for example /director).</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {STAFF_PAGES.map((page) => { const isHidden = hidden.includes(page); return (
          <div key={page} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3">
            <div className="min-w-0"><div className="flex items-center gap-1.5 text-sm font-medium">{isHidden ? <EyeOff className="h-3.5 w-3.5 text-warning" /> : <Eye className="h-3.5 w-3.5 text-accent" />}{PAGE_LABEL[page]}</div><div className="break-all font-mono text-xs text-muted-foreground">/{page}</div></div>
            <Toggle label={`Hide ${PAGE_LABEL[page]}`} on={isHidden} onChange={(v) => toggleHidden(page, v)} />
          </div>); })}
      </div>
    </div>
    <div role="tablist" aria-label="School directory" className="mb-5 flex flex-wrap gap-2">
      {([{ key: "registered", label: "Registered students", icon: ScanFace }, { key: "students", label: "Student List", icon: Users }, { key: "teachers", label: "Teachers", icon: BookOpen }, { key: "bot", label: "Telegram Bot", icon: Bot }] as const).map((t) => <Btn key={t.key} role="tab" aria-selected={view === t.key} variant={view === t.key ? "primary" : "ghost"} onClick={() => { setView(t.key); setSelected(null); setQuery(""); setStream("all"); setMessage(""); }}><t.icon className="h-4 w-4" />{t.label}</Btn>)}
    </div>
    {view === "bot" ? <TelegramBotPanel passcode={passcode} /> : <>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Search directory" className="field pl-9" placeholder="Search name or ID" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <select aria-label="Filter by stream and section" className="field w-auto max-w-full" value={stream} onChange={(e) => setStream(e.target.value)}><option value="all">All streams &amp; sections</option>{filterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      {view === "teachers" && <TeacherRosterTools passcode={passcode} onSaved={refresh} />}
      {view === "students" && <>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Choose student list file" onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(""); setMessage("");
          try {
            const rows = parseRosterFile(await file.arrayBuffer());
            setBatchName(academicYear());
            setPendingRows(rows);
          } catch (err) { setError(err instanceof Error ? err.message : "Could not read that file."); }
        }} />
        <Btn variant="ghost" title="Upload a new batch of students from Excel" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload list</Btn>
        <Btn variant="ghost" title="Add one student to the school list" onClick={() => { setAdding(true); setError(""); setMessage(""); }}><UserPlus className="h-4 w-4" />Add student</Btn>
      </>}
      <Btn variant="ghost" className="ml-auto" title="Export filtered list" onClick={exportRows} disabled={!shown.length}><Download className="h-4 w-4" />Export</Btn>
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="mb-3 text-sm text-accent">{message}</p>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label="Directory list" className="min-w-0">
        <div className="mb-2 text-xs text-muted-foreground">{shown.length} records</div>
        <div className="max-h-[650px] overflow-y-auto divide-y divide-border border-y border-border">
          {shown.map((p) => <div key={p.id} className={`flex items-center gap-2 py-3 ${picked?.id === p.id ? "bg-primary/10 shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
            <Btn variant="ghost" aria-label={`View ${p.name}`} className="min-w-0 flex-1 justify-start border-0 bg-transparent p-2 text-left font-normal" onClick={() => setSelected(p.id)}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">{p.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}</span>
              <span className="min-w-0"><span className="flex items-center gap-1.5 break-words font-semibold">{p.name}{p.verified && <BadgeCheck aria-label="Face verified" className="verified-badge h-4 w-4" />}</span><span className="block break-words text-xs text-muted-foreground">{p.id} · {p.stream}{p.batch ? ` · ${p.batch}` : ""}{p.kind === "student" && p.createdAt ? ` · Registered ${showDate(p.createdAt)}` : ""}</span></span>
            </Btn>
            <Btn variant="ghost" title={`Edit ${p.name}`} aria-label={`Edit ${p.name}`} className="shrink-0 px-2" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Btn>
            {p.target === "roster" && <Btn variant="ghost" title={`Delete ${p.name}`} aria-label={`Delete ${p.name}`} className="shrink-0 px-2 hover:text-destructive" disabled={busy} onClick={() => deletePerson(p)}><Trash2 className="h-4 w-4" /></Btn>}
            {p.target === "registered" && <Btn variant="ghost" title={`Reset face verification for ${p.name}`} aria-label={`Reset face verification for ${p.name}`} className="shrink-0 px-2" disabled={busy} onClick={async () => {
              if (!confirm(`Reset ${p.name}'s face verification? Their old photo is cleared and saved marks are kept. They must register again with a fresh photo.`)) return;
              setBusy(true); setError(""); setMessage("");
              try { await resetFace({ data: { passcode, id: p.id } }); setSelected(null); await refresh(); setMessage(`${p.name} can now re-register with a new photo.`); }
              catch (e) { setError(e instanceof Error ? e.message : "Could not reset verification."); }
              finally { setBusy(false); }
            }}><RotateCcw className="h-4 w-4" /></Btn>}
          </div>)}
          {!shown.length && <p className="py-12 text-center text-sm text-muted-foreground">{query || stream !== "all" ? "No matching records." : view === "registered" ? "No students have registered yet." : "No records."}</p>}
        </div>
      </section>
      <aside aria-label="Selected profile" className="min-w-0 border-border lg:border-l lg:pl-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><ScanFace className="h-4 w-4 text-primary" />Profile details</h2>
        {!picked ? <p className="text-sm text-muted-foreground">No profile selected.</p> : <>
          {picked.photoUrl ? <img src={picked.photoUrl} alt={picked.name} className="mb-4 aspect-square w-full max-w-[280px] rounded-lg object-cover" /> : <Avatar name={picked.name} className="mb-4 h-20 w-20 text-2xl" />}
          <div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 break-words text-lg font-semibold">{picked.name}{picked.verified && <span className="ml-2 inline-flex items-center gap-1 text-xs text-accent"><BadgeCheck className="verified-badge h-4 w-4" />Verified</span>}</h3><Btn variant="ghost" title="Edit details" aria-label="Edit selected details" className="px-2" onClick={() => startEdit(picked)}><Pencil className="h-4 w-4" /></Btn></div>
          <div className="mt-2 flex items-center gap-2 font-mono text-sm text-primary">{picked.id}<Btn variant="ghost" title="Copy ID" aria-label="Copy ID" className="px-2 py-1" onClick={async () => { try { await navigator.clipboard.writeText(picked.id); setMessage("ID copied."); } catch { setError("Could not copy ID."); } }}><Copy className="h-3 w-3" /></Btn></div>
          <dl className="mt-4 space-y-3 text-sm">{([["Stream", picked.stream], ["Grade / Section", `${picked.grade}${picked.section}`], ["Gender", picked.gender === "M" ? "Male" : picked.gender === "F" ? "Female" : "—"], ...(picked.kind === "teacher" ? [["Subjects", picked.subjects.join(", ") || "—"], ["Batch", picked.batch ?? "—"]] : [["Batch", picked.batch ?? "—"], ["Registered", picked.createdAt ? showDate(picked.createdAt, true) : "Not registered yet"]])] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>
          {picked.kind === "teacher" && <div className="mt-6 flex flex-wrap gap-2">
            <Btn variant="ghost" disabled={busy} onClick={() => startEdit(picked)}><Pencil className="h-4 w-4" />Edit details</Btn>
            <Btn variant="ghost" disabled={busy} onClick={async () => {
              if (!confirm(`Reset ${picked.name}'s password? Their old password stops working immediately.`)) return;
              setBusy(true); setError(""); setStaffMsg("");
              try { const r = await resetPw({ data: { passcode, role: "teacher", teacherId: picked.id } }); setMessage(`New password for ${picked.name}: ${r.code} — shown once, give it to them now.`); }
              catch (e) { setError(e instanceof Error ? e.message : "Could not reset the password."); }
              finally { setBusy(false); }
            }}><KeyRound className="h-4 w-4" />Reset password</Btn>
            <Btn variant="danger" disabled={busy} onClick={() => deletePerson(picked)}><Trash2 className="h-4 w-4" />Delete teacher</Btn>
          </div>}
          {picked.kind === "student" && picked.target === "roster" && <div className="mt-6 flex flex-wrap gap-2"><Btn variant="ghost" disabled={busy} onClick={() => startEdit(picked)}><Pencil className="h-4 w-4" />Edit details</Btn><Btn variant="danger" disabled={busy} onClick={() => deletePerson(picked)}><Trash2 className="h-4 w-4" />Delete student</Btn></div>}
          {picked.target === "registered" && <div className="mt-6 flex flex-wrap gap-2">
            <Btn variant="ghost" disabled={busy} onClick={() => startEdit(picked)}><Pencil className="h-4 w-4" />Edit details</Btn>
            <Btn variant="ghost" disabled={busy} onClick={async () => {
              if (!confirm(`Reset ${picked.name}'s face verification? Their old photo is cleared and saved marks are kept. They must register again with a fresh photo.`)) return;
              setBusy(true); setError("");
              try { await resetFace({ data: { passcode, id: picked.id } }); setSelected(null); await refresh(); setMessage(`${picked.name} can now re-register with a new photo.`); }
              catch (e) { setError(e instanceof Error ? e.message : "Could not reset verification."); }
              finally { setBusy(false); }
            }}><RotateCcw className="h-4 w-4" />Reset face verification</Btn>
            <Btn variant="ghost" disabled={busy} onClick={() => { setPinFor(picked); setNewPin(""); setError(""); setMessage(""); }}><KeyRound className="h-4 w-4" />Reset result passcode</Btn>
            <Btn variant="danger" disabled={busy} onClick={async () => {
              if (!confirm(`Clear ${picked.name}'s registration photo? Their school identity and saved marks will remain.`)) return;
              setBusy(true); setError("");
              try { await remove({ data: { passcode, id: picked.id } }); setSelected(null); await refresh(); setMessage("Registration photo cleared. Re-verification is required."); }
              catch (e) { setError(e instanceof Error ? e.message : "Could not remove registration."); }
              finally { setBusy(false); }
            }}><Trash2 className="h-4 w-4" />Remove registration</Btn>
          </div>}
        </>}
      </aside>
    </div>
    </>}
    {pinFor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pin-title">
      <form className="tile w-full max-w-sm space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setError("");
        if (!RESULT_PIN.test(newPin)) return setError("The passcode must be 4 to 6 numbers.");
        setBusy(true);
        try { await resetPin({ data: { passcode, id: pinFor.id, pin: newPin } }); setMessage(`New result passcode for ${pinFor.name}: ${newPin} — give it to the student now.`); setPinFor(null); setNewPin(""); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not reset the passcode."); }
        finally { setBusy(false); }
      }}>
        <div className="flex items-center"><h2 id="pin-title" className="flex-1 text-lg font-semibold">Reset result passcode</h2><Btn type="button" variant="ghost" aria-label="Cancel passcode reset" className="px-2" disabled={busy} onClick={() => setPinFor(null)}><X className="h-4 w-4" /></Btn></div>
        <p className="text-sm text-muted-foreground">{pinFor.name} <span className="font-mono">({pinFor.id})</span> forgot their passcode. Type a new one (4–6 numbers) and give it to them. The old passcode stops working.</p>
        <input autoFocus aria-label="New result passcode" className="field text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" maxLength={6} placeholder="e.g. 4821" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Btn className="w-full" disabled={busy || newPin.length < 4}><KeyRound className="h-4 w-4" />{busy ? "Saving…" : "Save new passcode"}</Btn>
      </form>
    </div>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <form className="tile max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError("");
        try {
          if (name.trim() !== editing.name) await edit({ data: { passcode, id: editing.id, target: editing.target, name } });
          if (details) await editTeacher({ data: { passcode, id: editing.id, details } });
          if (studentDetails) {
            const { registeredLocal, ...rest } = studentDetails;
            const registeredAt = editing.createdAt && registeredLocal ? new Date(registeredLocal).toISOString() : undefined;
            if (registeredAt && Date.parse(registeredAt) > Date.now() + 60_000) throw new Error("The registration date cannot be in the future.");
            await editStudent({ data: { passcode, id: editing.id, details: { ...rest, registeredAt } } });
          }
          await refresh(); setEditing(null); setMessage(details ? "Teacher details saved." : studentDetails ? "Student details saved." : "Name saved.");
        } catch (e) { setError(e instanceof Error ? e.message : "Could not save name."); }
        finally { setBusy(false); }
      }}>
        <div className="flex items-center"><h2 id="edit-title" className="flex-1 text-lg font-semibold">{details ? "Edit teacher" : studentDetails ? "Edit student" : "Edit name"}</h2><Btn type="button" variant="ghost" aria-label="Cancel editing" className="px-2" disabled={busy} onClick={() => setEditing(null)}><X className="h-4 w-4" /></Btn></div>
        <label htmlFor="edited-name" className="block text-sm">Full name</label>
        <input id="edited-name" autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={100} />
        {details && <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Stream<select className="field mt-1" value={details.stream} onChange={(e) => setDetails({ ...details, stream: e.target.value as TeacherDetails["stream"] })}><option>Natural Science</option><option>Social Science</option><option>Both</option></select></label>
            <label className="block text-sm">Gender<select className="field mt-1" value={details.gender} onChange={(e) => setDetails({ ...details, gender: e.target.value as TeacherDetails["gender"] })}><option value="M">Male</option><option value="F">Female</option></select></label>
            <label className="block text-sm">Grade<input className="field mt-1" value={details.grade} onChange={(e) => setDetails({ ...details, grade: e.target.value })} required maxLength={10} /></label>
            <label className="block text-sm">Section<input className="field mt-1" value={details.section} onChange={(e) => setDetails({ ...details, section: e.target.value })} maxLength={10} placeholder="e.g. A" /></label>
          </div>
          <fieldset><legend className="text-sm">Subjects</legend><div className="mt-2 grid grid-cols-2 gap-2">{SUBJECTS.map((x) => <label key={x} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={details.subjects.includes(x)} onChange={(e) => setDetails({ ...details, subjects: e.target.checked ? [...details.subjects, x] : details.subjects.filter((y) => y !== x) })} />{x}</label>)}</div></fieldset>
          <label className="block text-sm">Batch (school year)<input className="field mt-1" value={details.batch} onChange={(e) => setDetails({ ...details, batch: e.target.value })} required maxLength={40} placeholder={academicYear()} /></label>
        </>}
        {studentDetails && <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Stream<select className="field mt-1" value={studentDetails.stream} onChange={(e) => setStudentDetails({ ...studentDetails, stream: e.target.value as StudentDetails["stream"] })}><option>Natural Science</option><option>Social Science</option></select></label>
            <label className="block text-sm">Gender<select className="field mt-1" value={studentDetails.gender} onChange={(e) => setStudentDetails({ ...studentDetails, gender: e.target.value as StudentDetails["gender"] })}><option value="M">Male</option><option value="F">Female</option></select></label>
            <label className="block text-sm">Grade<input className="field mt-1" value={studentDetails.grade} onChange={(e) => setStudentDetails({ ...studentDetails, grade: e.target.value })} required maxLength={10} /></label>
            <label className="block text-sm">Section<select className="field mt-1" value={studentDetails.section} onChange={(e) => setStudentDetails({ ...studentDetails, section: e.target.value })}>{[...new Set(["A", "B", "C", studentDetails.section])].map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <label className="block text-sm">Batch (school year)<input className="field mt-1" value={studentDetails.batch} onChange={(e) => setStudentDetails({ ...studentDetails, batch: e.target.value })} required maxLength={40} placeholder={academicYear()} /></label>
          {editing.createdAt ? <label className="block text-sm">Registered date<input type="datetime-local" aria-label="Registered date" className="field mt-1" value={studentDetails.registeredLocal} max={toLocalInput(new Date().toISOString())} onChange={(e) => setStudentDetails({ ...studentDetails, registeredLocal: e.target.value })} /></label>
            : <p className="text-xs text-muted-foreground">Not registered yet — the registered date appears after they register.</p>}
          <p className="text-xs text-muted-foreground">The official ID ({editing.id}) stays the same so saved marks are kept.</p>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Btn className="w-full" disabled={busy}><Save className="h-4 w-4" />{busy ? "Saving…" : details ? "Save teacher" : studentDetails ? "Save student" : "Save name"}</Btn>
      </form>
    </div>}
    {pendingRows && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <form className="tile w-full max-w-md space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError("");
        try {
          const r = await upload({ data: { passcode, batch: batchName, rows: pendingRows } });
          setPendingRows(null); await refresh();
          setMessage(`Uploaded ${r.added} students to ${batchName}.${r.skipped ? ` ${r.skipped} already in the list were skipped.` : ""} Previous batches are kept.`);
        } catch (e) { setError(e instanceof Error ? e.message : "Could not upload the list."); }
        finally { setBusy(false); }
      }}>
        <div className="flex items-center"><h2 id="upload-title" className="flex-1 text-lg font-semibold">Upload student list</h2><Btn type="button" variant="ghost" aria-label="Cancel upload" className="px-2" disabled={busy} onClick={() => setPendingRows(null)}><X className="h-4 w-4" /></Btn></div>
        <p className="text-sm text-muted-foreground"><strong className="text-foreground">{pendingRows.length} students</strong> ready to add. Students already in the school list are skipped, and previous batches stay stored.</p>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border text-xs">
          {pendingRows.slice(0, 20).map((r, i) => <div key={i} className="flex justify-between gap-2 border-b border-border px-3 py-1.5 last:border-0"><span className="break-words">{r.full_name}</span><span className="shrink-0 text-muted-foreground">{r.grade}{r.section} · {r.stream === "Natural Science" ? "Nat" : "Soc"} · {r.gender}</span></div>)}
          {pendingRows.length > 20 && <div className="px-3 py-1.5 text-muted-foreground">…and {pendingRows.length - 20} more</div>}
        </div>
        <label htmlFor="batch-name" className="block text-sm">Batch (school year, e.g. {academicYear()})</label>
        <input id="batch-name" className="field" value={batchName} onChange={(e) => setBatchName(e.target.value)} required maxLength={40} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Btn className="w-full" disabled={busy || !batchName.trim()}><Upload className="h-4 w-4" />{busy ? "Uploading…" : `Add ${pendingRows.length} students`}</Btn>
      </form>
    </div>}
    {adding && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <form className="tile w-full max-w-sm space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError("");
        try {
          const r = await addStudent({ data: { passcode, student: newStudent } });
          setAdding(false); setNewStudent({ full_name: "", grade: "12", section: "A", stream: "Natural Science", gender: "M" });
          await refresh(); setMessage(`${newStudent.full_name} added with ID ${r.id}. They can now register.`);
        } catch (e) { setError(e instanceof Error ? e.message : "Could not add the student."); }
        finally { setBusy(false); }
      }}>
        <div className="flex items-center"><h2 id="add-title" className="flex-1 text-lg font-semibold">Add a student</h2><Btn type="button" variant="ghost" aria-label="Cancel adding" className="px-2" disabled={busy} onClick={() => setAdding(false)}><X className="h-4 w-4" /></Btn></div>
        <label htmlFor="ns-name" className="block text-sm">Full name</label>
        <input id="ns-name" className="field" value={newStudent.full_name} onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })} required minLength={3} maxLength={100} placeholder="As it should appear on the school list" />
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="ns-grade" className="block text-sm">Grade</label><input id="ns-grade" className="field" value={newStudent.grade} onChange={(e) => setNewStudent({ ...newStudent, grade: e.target.value })} required maxLength={10} /></div>
          <div><label htmlFor="ns-section" className="block text-sm">Section</label><select id="ns-section" className="field" value={newStudent.section} onChange={(e) => setNewStudent({ ...newStudent, section: e.target.value })}><option>A</option><option>B</option><option>C</option></select></div>
          <div><label htmlFor="ns-stream" className="block text-sm">Stream</label><select id="ns-stream" className="field" value={newStudent.stream} onChange={(e) => setNewStudent({ ...newStudent, stream: e.target.value as RosterRow["stream"] })}><option>Natural Science</option><option>Social Science</option></select></div>
          <div><label htmlFor="ns-gender" className="block text-sm">Gender</label><select id="ns-gender" className="field" value={newStudent.gender} onChange={(e) => setNewStudent({ ...newStudent, gender: e.target.value as RosterRow["gender"] })}><option value="M">Male</option><option value="F">Female</option></select></div>
        </div>
        <p className="text-xs text-muted-foreground">The official ID is assigned automatically, continuing from the last ID in that class.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Btn className="w-full" disabled={busy}><UserPlus className="h-4 w-4" />{busy ? "Adding…" : "Add to school list"}</Btn>
      </form>
    </div>}
  </div>;
}
