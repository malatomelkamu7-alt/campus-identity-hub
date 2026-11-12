import { z } from "zod";
export function teacherStream(stream: string, id: string) {
  return stream === "Social Science" || (stream === "Both" && id.startsWith("T-SOC-")) ? "Social Science" : "Natural Science";
}
export const canTakeStream = (student: string, target: string | null) => !!target && student === target;
/** Subjects a teacher may upload and see marks for: Mathematics teachers also handle SAT papers for their own stream. */
export const uploadSubjects = (subjects: string[]) => subjects.includes("Mathematics") && !subjects.includes("SAT") ? [...subjects, "SAT"] : subjects;
/** Staff pages the IT Admin can hide from the home page and menus; hidden pages still open from their direct link. */
export const STAFF_PAGES = ["director", "it-admin", "teacher"] as const;
export const isPageVisible = (page: string, hidden: string[] | null | undefined) => !(hidden ?? []).includes(page);
export const canReplaceFace = (existing: { face_verified: boolean } | null) => !existing || !existing.face_verified;
export const SUBJECTS = ["Physics", "Chemistry", "Biology", "Mathematics", "English", "Geography", "History", "Economics", "SAT"] as const;
export const teacherRowSchema = z.object({
  full_name: z.string().trim().min(3).max(100),
  stream: z.enum(["Natural Science", "Social Science"]),
  gender: z.enum(["M", "F"]),
  subjects: z.array(z.enum(SUBJECTS)).min(1).max(9),
});
export type TeacherRow = z.infer<typeof teacherRowSchema>;
export const teacherDetailsSchema = z.object({
  stream: z.enum(["Natural Science", "Social Science", "Both"]),
  grade: z.string().trim().min(1).max(10),
  section: z.string().trim().max(10),
  gender: z.enum(["M", "F"]),
  subjects: z.array(z.enum(SUBJECTS)).min(1).max(9),
  batch: z.string().trim().min(1).max(40),
});
export type TeacherDetails = z.infer<typeof teacherDetailsSchema>;

/** A registration date cannot be in the future (one minute of clock slack allowed). */
export const isValidRegisteredDate = (v: string, now = Date.now()) => { const t = Date.parse(v); return Number.isFinite(t) && t <= now + 60_000; };
export const studentDetailsSchema = z.object({
  grade: z.string().trim().min(1).max(10),
  section: z.string().trim().min(1).max(5),
  stream: z.enum(["Natural Science", "Social Science"]),
  gender: z.enum(["M", "F"]),
  batch: z.string().trim().min(1).max(40),
  registeredAt: z.string().max(40).refine(isValidRegisteredDate, "The registration date cannot be in the future.").optional(),
});
export type StudentDetails = z.infer<typeof studentDetailsSchema>;

/**
 * IT Admin class filter: "all", a whole stream ("Social Science"), or one Natural Science
 * section ("Natural Science:A"). Social Science is filtered as one group.
 */
export function matchesClassFilter(filter: string, p: { stream: string; section: string }) {
  if (filter === "all") return true;
  const [stream, section] = filter.split(":");
  return p.stream === stream && (!section || p.section.toUpperCase() === section);
}
/** Filter choices: every stream, plus each Natural Science section found in the list. */
export function classFilterOptions(people: { stream: string; section: string }[]) {
  const streams = [...new Set(people.map((p) => p.stream).filter(Boolean))].sort();
  const natural = [...new Set(people.filter((p) => p.stream === "Natural Science" && p.section).map((p) => p.section.toUpperCase()))].sort();
  return streams.flatMap((s) => [{ value: s, label: s === "Natural Science" && natural.length ? "Natural Science (all)" : s }, ...(s === "Natural Science" ? natural.map((x) => ({ value: `${s}:${x}`, label: `Natural Science — Section ${x}` })) : [])]);
}

/** School year label, e.g. "2026/27". The school year starts in September. */
export function academicYear(date = new Date()) {
  const y = date.getFullYear();
  const start = date.getMonth() >= 8 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** A student's own sign-in session counts as active for this long after their last request. */
export const SESSION_ACTIVE_MS = 2 * 60 * 1000;
export function sessionBlocksSignIn(examLive: boolean, seenAt: string | null, time = Date.now()) {
  return examLive && !!seenAt && time - Date.parse(seenAt) < SESSION_ACTIVE_MS;
}

/** Staff credential key: each teacher may have a personal password row. */
export const teacherCredentialKey = (id: string) => `teacher:${id}`;

/** Result PIN chosen at registration: digits only, 4 to 6 long. */
export const RESULT_PIN = /^\d{4,6}$/;
export const isValidResultPin = (pin: string) => RESULT_PIN.test(pin);
export async function hashResultPin(studentCode: string, pin: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bh-result:${studentCode.toUpperCase()}:${pin}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
