export type Band = { key: string; label: string; min: number };
export type BandRow = { key: string; label: string; male: number; female: number; total: number };

/** Highest possible total: 5 subjects (500), or 6 when SAT is added (600). */
export const maxTotal = (sat: boolean) => (sat ? 600 : 500);

/** Four bands of 100 marks counted down from the top: 500 → 400+/300/200/below 200, 600 → 500+/400/300/below 300. */
export function bandsFor(max = 500): Band[] {
  const top = max - 100, mid = max - 200, low = max - 300;
  return [
    { key: String(top), label: `${top} and above`, min: top },
    { key: String(mid), label: `${mid} – ${top - 1}`, min: mid },
    { key: String(low), label: `${low} – ${mid - 1}`, min: low },
    { key: "0", label: `Below ${low}`, min: -Infinity },
  ];
}
export const SCORE_BANDS = bandsFor(500);

/** Sum of every subject score (each out of 100) for one student. */
export function totalScore(scores: Record<string, number>) {
  return Object.values(scores).reduce((a, b) => a + b, 0);
}

export function bandOf(total: number, max = 500) {
  return bandsFor(max).find((b) => total >= b.min)!.key;
}

/** Count students per total-score band, split by gender. Students without results are skipped. */
export function scoreBands(students: { gender: string; scores: Record<string, number> }[], max = 500): BandRow[] {
  const rows = bandsFor(max).map((b) => ({ key: b.key, label: b.label, male: 0, female: 0, total: 0 }));
  for (const s of students) {
    if (!Object.keys(s.scores).length) continue;
    const row = rows.find((r) => r.key === bandOf(totalScore(s.scores), max))!;
    row.total += 1;
    if (s.gender === "M") row.male += 1;
    else if (s.gender === "F") row.female += 1;
  }
  return rows;
}

/** Search helper: matches name or ID, ignoring case, spaces and dashes (so "bh12a01" finds "BH-12A-01"). */
export function matchesPerson(query: string, p: { name: string; id: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const flat = (s: string) => s.toLowerCase().replace(/[\s\-_/.]/g, "");
  return p.name.toLowerCase().replace(/\s+/g, " ").includes(q.replace(/\s+/g, " ")) || flat(p.id).includes(flat(q));
}

/** Ranks rows already sorted by total (highest first). Students without marks get no rank; equal totals share a rank. */
export function rankRows<T extends { total: number; hasMarks: boolean }>(rows: T[]) {
  let rank = 0, last = Number.NaN, seen = 0;
  return rows.map((r) => {
    if (!r.hasMarks) return { ...r, rank: null as number | null };
    seen += 1;
    if (r.total !== last) { rank = seen; last = r.total; }
    return { ...r, rank: rank as number | null };
  });
}
