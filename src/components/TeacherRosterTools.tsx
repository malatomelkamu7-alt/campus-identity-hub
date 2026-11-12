import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { Upload, UserPlus, X } from "lucide-react";
import { Btn } from "@/components/Shell";
import { adminUploadTeachers } from "@/lib/students.functions";
import { teacherRowSchema, academicYear, type TeacherRow } from "@/lib/admin-rules";

export function TeacherRosterTools({ passcode, onSaved }: { passcode: string; onSaved: () => Promise<void> }) {
  const save = useServerFn(adminUploadTeachers);
  const file = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [rows, setRows] = useState<TeacherRow[] | null>(null);
  const [name, setName] = useState("");
  const [stream, setStream] = useState<TeacherRow["stream"]>("Natural Science");
  const [gender, setGender] = useState<TeacherRow["gender"]>("M");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [batch, setBatch] = useState(academicYear());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <>
    <input ref={file} className="hidden" type="file" accept=".xlsx,.xls,.csv" aria-label="Choose teacher list file" onChange={async e => {
      const selected = e.target.files?.[0]; e.target.value = "";
      if (!selected) return;
      setError(""); setMessage("");
      try {
        const wb = XLSX.read(await selected.arrayBuffer(), { type: "array" });
        const first = wb.SheetNames[0]; const sheet = first ? wb.Sheets[first] : undefined;
        if (!sheet) throw new Error("The file has no sheets.");
        const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }).map((r, i) => {
          const values = Object.fromEntries(Object.entries(r).map(([k,v]) => [k.trim().toLowerCase().replaceAll("_", " "), String(v).trim()]));
          const result = teacherRowSchema.safeParse({ full_name: values["name"] || values["full name"] || values["teacher name"], stream: values["stream"]?.toLowerCase().startsWith("soc") ? "Social Science" : values["stream"]?.toLowerCase().startsWith("nat") ? "Natural Science" : "", gender: (values["gender"] || values["sex"])?.slice(0,1).toUpperCase(), subjects: (values["subjects"] || values["subject"] || "").split(/[,;]/).map(v => v.trim()).filter(Boolean) });
          if (!result.success) throw new Error(`Row ${i+2}: use Name, Stream, Gender and Subjects (for example Physics; Mathematics).`);
          return result.data;
        });
        if (!parsed.length) throw new Error("No teachers found.");
        setRows(parsed);
      } catch (err) { setError(err instanceof Error ? err.message : "Could not read teacher file."); }
    }} />
    <Btn variant="ghost" title="Upload teachers from Excel" onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Upload list</Btn>
    <Btn variant="ghost" title="Add a teacher" onClick={() => { setAdding(true); setError(""); setMessage(""); }}><UserPlus className="h-4 w-4" />Add teacher</Btn>
    {error && !adding && !rows && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="w-full text-sm text-accent">{message}</p>}
    {(adding || rows) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="teacher-add-title">
      <form className="tile max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try {
          const uploadRows = rows ?? [teacherRowSchema.parse({ full_name: name, stream, gender, subjects })];
          const result = await save({ data: { passcode, batch, rows: uploadRows } });
          await onSaved(); setAdding(false); setRows(null); setName(""); setSubjects([]);
          setMessage(`${result.added} teachers added. ${result.skipped} duplicates skipped. Previous teachers kept.`);
        } catch(err) { setError(err instanceof Error ? err.message : "Could not add teachers."); } finally { setBusy(false); }
      }}>
        <div className="flex items-center justify-between"><h2 id="teacher-add-title" className="text-lg font-semibold">{rows ? "Upload teachers" : "Add a teacher"}</h2><Btn type="button" variant="ghost" aria-label="Cancel teacher entry" disabled={busy} onClick={() => { setAdding(false); setRows(null); }}><X className="h-4 w-4" /></Btn></div>
        {rows ? <div className="max-h-48 overflow-y-auto text-sm">{rows.map((r,i) => <p key={i} className="border-b border-border py-2">{r.full_name} · {r.stream} · {r.subjects.join(", ")}</p>)}</div> : <>
          <label className="block text-sm">Full name<input aria-label="Teacher full name" className="field mt-1" value={name} onChange={e => setName(e.target.value)} minLength={3} maxLength={100} required /></label>
          <label className="block text-sm">Stream<select aria-label="Teacher stream" className="field mt-1" value={stream} onChange={e => setStream(e.target.value as TeacherRow["stream"])}><option>Natural Science</option><option>Social Science</option></select></label>
          <label className="block text-sm">Gender<select aria-label="Teacher gender" className="field mt-1" value={gender} onChange={e => setGender(e.target.value as TeacherRow["gender"])}><option value="M">Male</option><option value="F">Female</option></select></label>
          <fieldset><legend className="text-sm">Subjects</legend><div className="mt-2 grid grid-cols-2 gap-2">{["Physics","Chemistry","Biology","Mathematics","English","Geography","History","Economics","SAT"].map(subject => <label key={subject} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={subjects.includes(subject)} onChange={e => setSubjects(e.target.checked ? [...subjects,subject] : subjects.filter(x => x!==subject))} />{subject}</label>)}</div></fieldset>
        </>}
        <label className="block text-sm">Batch (school year)<input aria-label="Teacher batch" className="field mt-1" value={batch} onChange={e => setBatch(e.target.value)} required maxLength={40} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Btn className="w-full" disabled={busy}><UserPlus className="h-4 w-4" />{busy ? "Saving…" : rows ? `Add ${rows.length} teachers` : "Save teacher"}</Btn>
      </form>
    </div>}
  </>;
}