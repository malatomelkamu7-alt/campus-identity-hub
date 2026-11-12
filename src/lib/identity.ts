export const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function requireRosterName<T extends { full_name: string; kind: string }>(rows: T[], name: string): T {
  const matches = rows.filter((row) => row.kind === "student" && normalizeName(row.full_name) === normalizeName(name));
  const match = matches[0];
  if (!match) throw new Error("Your name is not in the school list. Please contact IT Admin.");
  if (matches.length !== 1) throw new Error("Please contact IT Admin to confirm your school record.");
  return match;
}

export function requireAdminPin(pin: string, expected: string | undefined) {
  if (!expected) throw new Error("IT Admin PIN is not set up yet.");
  if (pin !== expected) throw new Error("Incorrect IT Admin PIN.");
}

export function requirePasscode(pin: string, expected: string | undefined, who: string) {
  if (!expected) throw new Error(`${who} password is not set up yet.`);
  if (pin !== expected) throw new Error(`Incorrect ${who} password.`);
}

/** Violations allowed before an attempt is auto-submitted and blocked. */
export const MAX_VIOLATIONS = 3;
export const shouldBlock = (violations: number) => violations > MAX_VIOLATIONS;

export const SECTIONS = ["A", "B", "C"] as const;
export const NATURAL_SUBJECTS = ["Physics", "Chemistry", "Biology", "Mathematics", "English"];
export const SOCIAL_SUBJECTS = ["Geography", "History", "Economics", "Mathematics", "English"];
export const subjectsFor = (stream: string, sat: boolean) => {
  const base = stream === "Social Science" ? SOCIAL_SUBJECTS : NATURAL_SUBJECTS;
  return sat ? [...base, "SAT"] : base;
};

export function seeded(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)), (h >>> 0) / 4294967296);
}
export function shuffle<T>(arr: T[], seed: string): T[] {
  const r = seeded(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
export function fmt(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
