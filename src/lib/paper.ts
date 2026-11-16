/* Shared, browser-safe helpers for scanned exam papers. */

/** Where a question's picture (graph, diagram, table…) sits: a box on a page image, or a picture embedded in a Word file. */
export type FigureRef = { source: "page" | "embedded"; index: number; box: [number, number, number, number] };
export type ScannedQuestion = {
  text: string;
  options: [string, string, string, string];
  answer: number | null;
  marks: number;
  passage: string | null;
  figure: FigureRef | null;
};

export const MAX_TEXT = 4000;
export const MAX_OPTION = 1000;
export const MAX_PASSAGE = 12000;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function readFigure(raw: unknown): FigureRef | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const source = f["source"] === "embedded" ? "embedded" : f["source"] === "page" ? "page" : null;
  const index = Math.round(Number(f["index"]));
  if (!source || !Number.isFinite(index) || index < 1) return null;
  if (source === "embedded") return { source, index, box: [0, 0, 1000, 1000] };
  const [x0, y0, x1, y1] = ["x0", "y0", "x1", "y1"].map((k) => clamp(Number(f[k]), 0, 1000));
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1! - x0! < 15 || y1! - y0! < 15) return null;
  return { source, index, box: [x0!, y0!, x1!, y1!] };
}

/** Turns the reader's reply into four-choice questions in paper order; skips anything without a question and two choices. */
export function normalizeScanned(parsed: unknown): ScannedQuestion[] {
  const root = parsed as { questions?: unknown; passages?: unknown };
  const list = root?.questions;
  if (!Array.isArray(list)) return [];
  const passages = new Map<string, string>();
  if (Array.isArray(root.passages)) for (const p of root.passages) {
    const r = p as Record<string, unknown> | null;
    const id = String(r?.["id"] ?? "").trim();
    const text = String(r?.["text"] ?? "").trim().slice(0, MAX_PASSAGE);
    if (id && text) passages.set(id, text);
  }
  const out: ScannedQuestion[] = [];
  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const r = q as Record<string, unknown>;
    const text = String(r["text"] ?? "").replace(/^\s*(?:Q(?:uestion)?\s*)?\d+\s*[.):-]\s*/i, "").replace(/\s*[([]\s*\d+\s*(?:marks?|pts?|points?)\s*[)\]]\s*$/i, "").trim().slice(0, MAX_TEXT);
    const opts = (Array.isArray(r["options"]) ? r["options"] : [])
      .map((o) => String(o ?? "").replace(/^\s*\(?[A-Da-d][.)]\s*/, "").trim().slice(0, MAX_OPTION))
      .filter(Boolean);
    if (!text || opts.length < 2) continue;
    const options = [opts[0] ?? "", opts[1] ?? "", opts[2] ?? "", opts[3] ?? ""] as [string, string, string, string];
    const shown = !("answer_evidence" in r) || (typeof r["answer_evidence"] === "string" && r["answer_evidence"].trim() !== "");
    const letter = shown && typeof r["answer"] === "string" ? r["answer"].trim().toUpperCase().replace(/[^A-D]/g, "").charAt(0) : "";
    const idx = letter ? "ABCD".indexOf(letter) : -1;
    const answer = idx >= 0 && options[idx] ? idx : null;
    const m = Math.round(Number(r["marks"]));
    const pid = typeof r["passage_id"] === "string" ? r["passage_id"].trim() : "";
    out.push({ text, options, answer, marks: Number.isFinite(m) && m > 0 ? Math.min(10, m) : 1, passage: passages.get(pid) ?? null, figure: readFigure(r["figure"]) });
  }
  return out.slice(0, 300);
}

/** A figure box (0–1000 page units) widened a little so labels and axes at the edge are not cut off. */
export function paddedBox(box: [number, number, number, number], pad = 12): [number, number, number, number] {
  const [x0, y0, x1, y1] = box;
  return [clamp(x0 - pad, 0, 1000), clamp(y0 - pad, 0, 1000), clamp(x1 + pad, 0, 1000), clamp(y1 + pad, 0, 1000)];
}

/**
 * Rows to keep after cutting a figure: a thin strip of ink touching the top or bottom edge, separated from
 * the figure by blank rows, is the cut-off edge of a neighbouring text line and is dropped.
 * `ink[r]` tells whether row r has any dark pixel. Returns [first row, last row + 1].
 */
export function edgeTrim(ink: boolean[], maxBandFrac = 0.07, minGap = 4): [number, number] {
  const n = ink.length, maxBand = Math.max(2, Math.floor(n * maxBandFrac));
  const cut = (rows: boolean[]) => {
    if (!rows[0]) return 0;
    let r = 0;
    while (r < rows.length && rows[r]) r++;
    if (r > maxBand) return 0;
    let g = r;
    while (g < rows.length && !rows[g]) g++;
    return g - r >= minGap && g < rows.length ? r : 0;
  };
  const top = cut(ink), bottom = cut([...ink].reverse());
  return top + bottom < n * 0.5 ? [top, n - bottom] : [0, n];
}

/**
 * Splits a paper into blocks that are shuffled as one: questions next to each other that share a
 * reading passage stay together and in their order, every other question is its own block.
 */
export function groupByPassage<T extends { passage?: string | null | undefined }>(qs: T[]): T[][] {
  const out: T[][] = [];
  for (const q of qs) {
    const last = out[out.length - 1];
    if (q.passage && last && last[0]?.passage === q.passage) last.push(q);
    else out.push([q]);
  }
  return out;
}

/** Saved figure files live under the teacher's own folder in private storage. */
export const FIGURE_PATH = /^[A-Za-z0-9-]{1,30}\/[a-f0-9-]{36}\.jpg$/;

export const PAPER_ACCEPT = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";
export const MAX_PAPER_BYTES = 25 * 1024 * 1024;
export const MAX_PAPER_PAGES = 30;

/** Longest "Given" sheet (values, constants, formulas, data tables) a paper may carry. */
export const MAX_GIVEN = 8000;

/** The paper's "Given" sheet from the reader's reply, or null when the paper gives nothing to use during the exam. */
export function readGiven(parsed: unknown): string | null {
  const g = (parsed as { given?: unknown } | null)?.given;
  if (typeof g !== "string") return null;
  const text = g.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_GIVEN);
  return text && !/^(none|n\/a|null|-)$/i.test(text) ? text : null;
}

export type GivenBlock = { kind: "text"; text: string } | { kind: "table"; rows: string[][] };
const isRow = (l: string) => /\s\|\s/.test(l) || /^\s*\|.*\|\s*$/.test(l);
const isRule = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

/** Splits a "Given" sheet into plain lines and tables (rows written with cells separated by " | "). */
export function givenBlocks(text: string): GivenBlock[] {
  const out: GivenBlock[] = [];
  for (const line of text.split("\n")) {
    const last = out[out.length - 1];
    if (isRule(line)) continue;
    if (isRow(line)) {
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      if (last?.kind === "table") last.rows.push(cells); else out.push({ kind: "table", rows: [cells] });
    } else if (last?.kind === "text") last.text += `\n${line}`;
    else out.push({ kind: "text", text: line });
  }
  return out.map((b) => (b.kind === "text" ? { ...b, text: b.text.trim() } : b)).filter((b) => b.kind === "table" || b.text);
}

/** Why a paper can't be saved like this, or null. A submitted or live paper must keep at least one question. */
export function bankSaveProblem(status: "draft" | "queued", questionCount: number, inLiveExam: boolean): string | null {
  if (questionCount > 0) return null;
  if (inLiveExam) return "This paper is being used in the live exam right now, so its questions can't all be removed. Wait until the exam is closed.";
  if (status === "queued") return "Add at least one question before submitting to the Director.";
  return null;
}
