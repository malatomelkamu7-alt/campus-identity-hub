import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeName, requireRosterName, requireAdminPin } from "@/lib/identity";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
export { normalizeName } from "@/lib/identity";

import { canReplaceFace, teacherRowSchema, teacherDetailsSchema, studentDetailsSchema, academicYear, sessionBlocksSignIn, teacherCredentialKey, RESULT_PIN, hashResultPin } from "@/lib/admin-rules";

const BUCKET = "student-photos";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Class, stream and gender come from the school roster record, not the form.
const registerSchema = z.object({
  fullName: z.string().trim().min(3, "Enter your full name").max(100),
  photo: z.string().startsWith("data:image/jpeg;base64,").max(3_000_000),
  resultPin: z.string().regex(RESULT_PIN, "Your result passcode must be 4 to 6 numbers."),
});

export type PublicStudent = {
  id: string; name: string; grade: string; section: string; stream: string; gender: string; photoUrl: string | null; createdAt: string; verified: boolean; sessionToken?: string;
};

async function signedUrl(path: string) {
  const sb = await admin();
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

async function photoDataUrl(path: string) {
  const sb = await admin();
  const { data } = await sb.storage.from(BUCKET).download(path);
  if (!data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

type Row = { student_code: string; full_name: string; grade: string; section: string; stream: string; gender: string; photo_path: string; created_at: string; face_verified: boolean };
async function toPublic(r: Row): Promise<PublicStudent> {
  return { id: r.student_code, name: r.full_name, grade: r.grade, section: r.section, stream: r.stream, gender: r.gender, photoUrl: r.face_verified && r.photo_path ? await signedUrl(r.photo_path) : null, createdAt: r.created_at, verified: r.face_verified };
}

export const registerStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => registerSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: settings } = await sb.from("exam_settings").select("registration_open").eq("id", 1).single();
    if (!settings?.registration_open) throw new Error("Registration is closed. Please contact IT Admin.");
    const { data: roster, error: rosterError } = await sb.from("school_roster").select("*").eq("kind", "student");
    if (rosterError) throw new Error("Could not check the school list. Please try again.");
    const record = requireRosterName(roster ?? [], data.fullName);
    const { data: existing } = await sb.from("registered_students").select("id,face_verified,photo_path").eq("roster_id", record.id).maybeSingle();
    if (!canReplaceFace(existing)) throw new Error("You are already registered. Please sign in or contact IT Admin for your ID.");
    const section = record.section.toUpperCase();
    const encoded = data.photo.split(",")[1];
    if (!encoded) throw new Error("Please retake your photo.");
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    if (bytes.length < 5000) throw new Error("Photo is too small. Please retake it.");

    const { checkUncovered, checkNotDuplicate } = await import("@/lib/face.server");
    await checkUncovered(data.photo);
    const { data: others } = await sb.from("registered_students").select("photo_path").eq("face_verified", true).neq("student_code", record.id).neq("photo_path", "");
    // Send registered photos as inline images: the AI never has to fetch private storage links.
    const photos = (await Promise.all((others ?? []).map((o) => photoDataUrl(o.photo_path)))).filter((u): u is string => !!u);
    await checkNotDuplicate(data.photo, photos);

    const code = record.id; // official school ID, e.g. BH-12A-01
    const path = `${code}/${Date.now()}.jpg`;
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
    if (up.error) throw new Error("Could not save the photo. Please try again.");
    const token = crypto.randomUUID();
    const values = {
      session_token: token, session_seen_at: new Date().toISOString(), created_at: new Date().toISOString(),
      student_code: code, full_name: record.full_name, grade: record.grade, section, stream: record.stream, gender: record.gender, photo_path: path, roster_id: record.id, face_verified: true,
      results_pin_hash: await hashResultPin(code, data.resultPin),
    };
    const { data: row, error } = existing
      ? await sb.from("registered_students").update(values).eq("id", existing.id).eq("face_verified", false).select().single()
      : await sb.from("registered_students").insert(values).select().single();
    if (error || !row) {
      await sb.storage.from(BUCKET).remove([path]);
      throw new Error("Could not register. Please try again.");
    }
    if (existing?.photo_path) await sb.storage.from(BUCKET).remove([existing.photo_path]);
    return { ...(await toPublic(row)), sessionToken: token };
  });

export const loginStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(100), id: z.string().trim().min(3).max(30), token: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: row } = await sb.from("registered_students").select("*").eq("student_code", data.id.toUpperCase()).maybeSingle();
    if (!row || normalizeName(row.full_name) !== normalizeName(data.name)) return { ok: false as const, error: "Name and ID do not match our records." };
    if (!row.face_verified) return { ok: false as const, error: "IT Admin reset your face verification. Please register again with a fresh photo." };
    const sameDevice = !!data.token && data.token === row.session_token;
    if (!sameDevice) {
      const { data: st } = await sb.from("exam_settings").select("exam_live,current_round").eq("id", 1).single();
      // A device that lost power or internet has its exam frozen; the student may sign in again (on the same or another device) to wait for the Director.
      const { data: frozen } = await sb.from("exam_attempts").select("id").eq("student_code", row.student_code).eq("status", "in_progress").eq("pause_reason", "connection").limit(1);
      if (!frozen?.length && sessionBlocksSignIn(!!st?.exam_live, row.session_token ? row.session_seen_at : null)) {
        await sb.from("exam_events").insert({ kind: "violation", student_code: row.student_code, round: st?.current_round ?? null, message: `Second sign-in blocked for ${row.full_name} — already signed in on another device` });
        return { ok: false as const, error: "This student is already signed in on another device during the exam. Only one sign-in is allowed." };
      }
    }
    const token = sameDevice && data.token ? data.token : crypto.randomUUID();
    await sb.from("registered_students").update({ session_token: token, session_seen_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true as const, student: { ...(await toPublic(row)), sessionToken: token } };
  });

/** Keeps the student's sign-in active; reports when another device has taken over. */
export const studentPing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().trim().min(3).max(30), token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: row } = await sb.from("registered_students").update({ session_seen_at: new Date().toISOString() }).eq("student_code", data.id.toUpperCase()).eq("session_token", data.token).select("id").maybeSingle();
    return { active: !!row };
  });

export const studentSignOut = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().trim().min(3).max(30), token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    await sb.from("registered_students").update({ session_token: null, session_seen_at: null }).eq("student_code", data.id.toUpperCase()).eq("session_token", data.token);
    return { ok: true };
  });

function checkPasscode(p: string) {
  requireAdminPin(p, process.env["IT_ADMIN_PASSCODE"]);
}

export const adminSetRegistration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), open: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { error } = await sb.from("exam_settings").upsert({ id: 1, registration_open: data.open, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not update registration.");
    const { notifyStatusChanges } = await import("@/lib/telegram.server");
    await notifyStatusChanges().catch((e) => console.error("Telegram notice failed", e));
    return { ok: true };
  });

export const adminListStudents = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { data: rows, error } = await sb.from("registered_students").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("Could not load students.");
    return Promise.all((rows ?? []).map(toPublic));
  });

export const adminDeleteStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), id: z.string().min(3).max(30) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { data: row } = await sb.from("registered_students").select("photo_path").eq("student_code", data.id).maybeSingle();
    const { error } = await sb.from("registered_students").update({ face_verified: false, photo_path: "" }).eq("student_code", data.id);
    if (error) throw new Error("Could not remove this registration.");
    if (row) await sb.storage.from(BUCKET).remove([row.photo_path]);
    return { ok: true };
  });

export const checkRegistrationName = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(3).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await sb.from("school_roster").select("*").eq("kind", "student");
    if (error) throw new Error("Could not check the school list.");
    requireRosterName(rows ?? [], data.name);
    return { ok: true };
  });

export type RosterPerson = { id: string; full_name: string; kind: string; grade: string; section: string; stream: string; gender: string; subjects: string[]; batch: string };
export const adminDirectory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const [roster, registered] = await Promise.all([
      sb.from("school_roster").select("*").order("full_name"),
      sb.from("registered_students").select("*").order("created_at", { ascending: false }),
    ]);
    if (roster.error || registered.error) throw new Error("Could not load the school directory.");
    const { data: st } = await sb.from("exam_settings").select("registration_open,hidden_staff_roles").eq("id", 1).single();
    return { hiddenStaffRoles: st?.hidden_staff_roles ?? [], registrationOpen: !!st?.registration_open, roster: roster.data, registered: await Promise.all(registered.data.map(toPublic)) };
  });

export const adminEditName = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), id: z.string().min(1).max(40), target: z.enum(["roster", "registered"]), name: z.string().trim().min(3).max(100) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { error } = await sb.rpc("admin_edit_identity_name", { person_id: data.id, person_target: data.target, new_name: data.name.replace(/\s+/g, " ") });
    if (error) throw new Error("Could not save this name. Please try again.");
    return { ok: true };
  });

/* ---------------- Batch upload & manual add ---------------- */

const STREAMS = ["Natural Science", "Social Science"] as const;
const rosterRowSchema = z.object({
  full_name: z.string().trim().min(3).max(100),
  grade: z.string().trim().min(1).max(10),
  section: z.string().trim().min(1).max(5),
  stream: z.enum(STREAMS),
  gender: z.enum(["M", "F"]),
});
type RosterRow = z.infer<typeof rosterRowSchema>;

type RosterRecord = { id: string; full_name: string; kind: string; grade: string; section: string; batch: string };

/** Next official ID for a class, e.g. BH-12A-04 after BH-12A-03. */
function nextId(existing: RosterRecord[], grade: string, section: string, taken: Set<string>) {
  const prefix = `BH-${grade}${section.toUpperCase()}-`;
  let max = 0;
  for (const r of existing) {
    if (!r.id.startsWith(prefix)) continue;
    const n = Number(r.id.slice(prefix.length));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  let n = max;
  let id = "";
  do { n += 1; id = `${prefix}${String(n).padStart(2, "0")}`; } while (taken.has(id));
  taken.add(id);
  return id;
}

export const adminUploadRoster = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), batch: z.string().trim().min(1).max(40), rows: z.array(rosterRowSchema).min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { data: existing, error } = await sb.from("school_roster").select("id,full_name,kind,grade,section,batch");
    if (error) throw new Error("Could not read the school list. Please try again.");
    const roster = (existing ?? []) as RosterRecord[];
    const taken = new Set(roster.map((r) => r.id));
    const seen = new Set(roster.filter((r) => r.kind === "student").map((r) => `${normalizeName(r.full_name)}|${r.grade}${r.section.toUpperCase()}`));
    const inserts: TablesInsert<"school_roster">[] = [];
    let skipped = 0;
    for (const row of data.rows) {
      const key = `${normalizeName(row.full_name)}|${row.grade}${row.section.toUpperCase()}`;
      if (seen.has(key)) { skipped += 1; continue; }
      seen.add(key);
      inserts.push({
        id: nextId(roster, row.grade, row.section, taken),
        full_name: row.full_name.replace(/\s+/g, " "),
        kind: "student",
        grade: row.grade,
        section: row.section.toUpperCase(),
        stream: row.stream,
        gender: row.gender,
        subjects: [],
        batch: data.batch,
      });
    }
    if (inserts.length) {
      const { error: insErr } = await sb.from("school_roster").insert(inserts);
      if (insErr) throw new Error("Could not save the new list. Please try again.");
    }
    return { ok: true, added: inserts.length, skipped };
  });

export const adminAddRosterStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), student: rosterRowSchema }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { data: existing, error } = await sb.from("school_roster").select("id,full_name,kind,grade,section,batch");
    if (error) throw new Error("Could not read the school list. Please try again.");
    const roster = (existing ?? []) as RosterRecord[];
    const s = data.student;
    const dup = roster.some((r) => r.kind === "student" && normalizeName(r.full_name) === normalizeName(s.full_name) && r.grade === s.grade && r.section.toUpperCase() === s.section.toUpperCase());
    if (dup) throw new Error("This student is already in the school list for that class.");
    const taken = new Set(roster.map((r) => r.id));
    const id = nextId(roster, s.grade, s.section, taken);
    const { error: insErr } = await sb.from("school_roster").insert({
      id, full_name: s.full_name.replace(/\s+/g, " "), kind: "student", grade: s.grade,
      section: s.section.toUpperCase(), stream: s.stream, gender: s.gender, subjects: [], batch: academicYear(),
    });
    if (insErr) throw new Error("Could not add the student. Please try again.");
    return { ok: true, id };
  });

/** Remove a registration + photo so the student can re-register and re-verify their face. */
export const adminResetFace = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), id: z.string().min(3).max(30) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { data: row } = await sb.from("registered_students").select("photo_path").eq("student_code", data.id).maybeSingle();
    if (!row) throw new Error("This student has no registration to reset.");
    const { error } = await sb.from("registered_students").update({ face_verified: false, photo_path: "" }).eq("student_code", data.id);
    if (error) throw new Error("Could not reset this verification.");
    await sb.storage.from(BUCKET).remove([row.photo_path]);
    return { ok: true };
  });

export const adminUploadTeachers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), batch: z.string().trim().min(1).max(40), rows: z.array(teacherRowSchema).min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { data: existing, error } = await sb.from("school_roster").select("id,full_name,stream").eq("kind", "teacher");
    if (error) throw new Error("Could not read teachers.");
    const taken = new Set((existing ?? []).map(r => r.id));
    const names = new Set((existing ?? []).map(r => `${normalizeName(r.full_name)}|${r.stream}`));
    const inserts: TablesInsert<"school_roster">[] = [];
    let skipped = 0;
    for (const r of data.rows) {
      const key = `${normalizeName(r.full_name)}|${r.stream}`;
      if (names.has(key)) { skipped++; continue; }
      names.add(key);
      const prefix = r.stream === "Natural Science" ? "T-NAT-" : "T-SOC-";
      let n = 1;
      while (taken.has(`${prefix}${String(n).padStart(2, "0")}`)) n++;
      const id = `${prefix}${String(n).padStart(2, "0")}`;
      taken.add(id);
      inserts.push({ ...r, id, kind: "teacher", grade: "12", section: "", batch: data.batch });
    }
    if (inserts.length) {
      const { error: saveError } = await sb.from("school_roster").insert(inserts);
      if (saveError) throw new Error("Could not add teachers. Please try again.");
    }
    return { added: inserts.length, skipped };
  });

/** Permanently remove a student or teacher from the school list. */
export const adminDeletePerson = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), id: z.string().min(3).max(40) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { data: person } = await sb.from("school_roster").select("id,kind").eq("id", data.id).maybeSingle();
    if (!person) throw new Error("This person is not in the school list.");
    if (person.kind === "teacher") {
      const { data: st } = await sb.from("exam_settings").select("exam_live,active_bank_id").eq("id", 1).single();
      const { data: banks } = await sb.from("question_banks").select("id").eq("teacher_id", data.id);
      if (st?.exam_live && (banks ?? []).some((b) => b.id === st.active_bank_id)) throw new Error("This teacher's paper is live. Close the exam first.");
      const unlink = await sb.from("question_banks").update({ teacher_id: null }).eq("teacher_id", data.id);
      if (unlink.error) throw new Error("Could not remove this teacher.");
      await sb.from("staff_credentials").delete().eq("role", teacherCredentialKey(data.id));
    } else {
      const { data: reg } = await sb.from("registered_students").select("photo_path").eq("student_code", data.id).maybeSingle();
      for (const table of ["exam_events", "round_results", "exam_attempts"] as const) {
        const { error } = await sb.from(table).delete().eq("student_code", data.id);
        if (error) throw new Error("Could not remove this student's exam records.");
      }
      await sb.from("telegram_users").update({ student_code: null, id_confirmed: false, state: "await_name" }).eq("student_code", data.id);
      const { error } = await sb.from("registered_students").delete().eq("student_code", data.id);
      if (error) throw new Error("Could not remove this student's registration.");
      if (reg?.photo_path) await sb.storage.from(BUCKET).remove([reg.photo_path]);
    }
    const { error } = await sb.from("school_roster").delete().eq("id", data.id);
    if (error) throw new Error("Could not remove this person.");
    return { ok: true };
  });

export const adminEditTeacher = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), id: z.string().min(3).max(40), details: teacherDetailsSchema }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { error, data: row } = await sb.from("school_roster").update({ ...data.details, section: data.details.section.toUpperCase() }).eq("id", data.id).eq("kind", "teacher").select("id").maybeSingle();
    if (error || !row) throw new Error("Could not save the teacher's details.");
    return { ok: true };
  });

/** IT Admin edits a student's class details and, when registered, their registration date. */
export const adminEditStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), id: z.string().min(3).max(30), details: studentDetailsSchema }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { registeredAt, ...d } = data.details;
    const section = d.section.toUpperCase();
    const { data: row, error } = await sb.from("school_roster").update({ ...d, section }).eq("id", data.id).eq("kind", "student").select("id").maybeSingle();
    if (error || !row) throw new Error("Could not save this student's details.");
    const reg: TablesUpdate<"registered_students"> = { grade: d.grade, section, stream: d.stream, gender: d.gender };
    if (registeredAt) reg.created_at = new Date(registeredAt).toISOString();
    const { error: regError } = await sb.from("registered_students").update(reg).eq("student_code", data.id);
    if (regError) throw new Error("Saved the school list, but could not update the registration. Please try again.");
    return { ok: true };
  });

export const adminResetResultPin = createServerFn({ method: "POST" })
 .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), id: z.string().min(3).max(30), pin: z.string().regex(RESULT_PIN) }).parse(d))
 .handler(async ({ data }) => {
   checkPasscode(data.passcode); const sb = await admin();
   const { data: row, error } = await sb.from("registered_students").update({ results_pin_hash: await hashResultPin(data.id,data.pin) }).eq("student_code",data.id).select("id").maybeSingle();
   if (error || !row) throw new Error("Could not reset this student's result passcode."); return { ok: true };
 });
export const adminSetStaffVisibility = createServerFn({ method: "POST" })
 .inputValidator((d: unknown) => z.object({ passcode: z.string().min(1).max(200), hidden: z.array(z.enum(["director","it-admin","teacher"])).max(3) }).parse(d))
 .handler(async ({ data }) => { checkPasscode(data.passcode); const sb = await admin(); const { error } = await sb.from("exam_settings").update({ hidden_staff_roles: data.hidden }).eq("id",1); if(error) throw new Error("Could not change page visibility."); return { ok:true }; });
