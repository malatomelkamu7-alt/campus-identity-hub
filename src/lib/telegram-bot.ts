/** Browser-safe rules and wording shared by the Telegram bot and the IT Admin bot page. */

export const MENU = {
  result: "📊 My Result",
  profile: "👤 Profile",
  status: "📅 Exam Status",
  news: "📢 Announcements",
  help: "🆘 Help",
  portal: "🌐 Open Portal",
  signOut: "🚪 Sign out",
  cancel: "⬅️ Back to menu",
} as const;

/** Wrong result passcodes allowed before the bot pauses result checks for that chat. */
export const PIN_MAX_FAILURES = 3;
export const PIN_LOCK_MIN = 15;
export function afterWrongPin(failures: number, now = Date.now()) {
  const next = failures + 1;
  return next >= PIN_MAX_FAILURES
    ? { failures: 0, lockedUntil: new Date(now + PIN_LOCK_MIN * 60_000).toISOString(), left: 0 }
    : { failures: next, lockedUntil: null, left: PIN_MAX_FAILURES - next };
}
export const pinLockMinutesLeft = (lockedUntil: string | null, now = Date.now()) => {
  if (!lockedUntil) return 0;
  const ms = Date.parse(lockedUntil) - now;
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
};

/** Who an IT Admin message goes to. */
export const AUDIENCES = [
  { value: "all", label: "Everyone who started the bot" },
  { value: "registered", label: "Registered students only" },
  { value: "unregistered", label: "Not registered yet" },
  { value: "Natural Science", label: "Natural Science students" },
  { value: "Social Science", label: "Social Science students" },
] as const;
export type Audience = (typeof AUDIENCES)[number]["value"];
export function inAudience(audience: Audience, u: { blocked: boolean; student_code: string | null; stream: string | null }) {
  if (u.blocked) return false;
  if (audience === "all") return true;
  if (audience === "registered") return !!u.student_code;
  if (audience === "unregistered") return !u.student_code;
  return !!u.student_code && u.stream === audience;
}

/**
 * Telegram must call a public address. The editor preview address sits behind a sign-in,
 * so it is swapped for the project's public preview address.
 */
export function webhookUrlFor(origin: string) {
  const u = new URL(origin);
  const m = u.hostname.match(/^id-preview--([a-z0-9-]+?)\.(.+)$/i);
  const host = m ? `project--${m[1]}-dev.${m[2]}` : u.hostname;
  return `https://${host}/api/public/telegram/webhook`;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function statusLines(s: { registrationOpen: boolean; examLive: boolean; resultsPublished: boolean; papers?: { subject: string; stream: string | null }[] }) {
  const papers = (s.papers ?? []).map((p) => `${p.subject}${p.stream ? ` (${p.stream})` : ""}`).join(", ");
  return [
    `📝 Registration: ${s.registrationOpen ? "<b>OPEN</b>" : "<b>CLOSED</b>"}`,
    `🖊 Exam: ${s.examLive ? `<b>LIVE</b>${papers ? ` — ${escapeHtml(papers)}` : ""}` : "<b>CLOSED</b>"}`,
    `📊 Results: ${s.resultsPublished ? "<b>PUBLISHED</b>" : "<b>CLOSED</b>"}`,
  ].join("\n");
}

/** Same as the portal results page: each subject score and the total only. */
export function resultText(p: { name: string; grade: string; section: string; stream: string; subjects: string[]; scores: Record<string, number> }) {
  const lines = p.subjects.map((s) => `• ${s}: <b>${p.scores[s] ?? "—"}</b>`);
  const total = p.subjects.reduce((n, s) => n + (p.scores[s] ?? 0), 0);
  const has = p.subjects.some((s) => p.scores[s] !== undefined);
  return [
    `📊 <b>Your results</b>`,
    `${escapeHtml(p.name)} · ${escapeHtml(p.grade + p.section)} · ${escapeHtml(p.stream)}`,
    "",
    ...lines,
    "",
    has ? `<b>Total: ${total} / ${p.subjects.length * 100}</b>` : "No marks have been recorded for you yet.",
  ].join("\n");
}
