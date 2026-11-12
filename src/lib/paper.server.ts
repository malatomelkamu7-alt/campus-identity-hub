/* Reads an uploaded exam paper (page pictures from a PDF or photo, or text and pictures from a Word/text file)
   and returns its multiple-choice questions in order, with formulas, reading passages and figure positions. */
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, jsonSchema, NoObjectGeneratedError, type ModelMessage, type UserContent } from "ai";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai/run-id.server";
import { normalizeScanned, type ScannedQuestion } from "@/lib/paper";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `You read school multiple-choice exam papers (Grade 12, Ethiopia) and copy their questions exactly.
Extract EVERY question in the exact order it appears, never skipping or merging questions.

For each question:
- text: the full question wording without its number. Keep line breaks with \\n where the paper breaks lines.
- options: its choices in order (A, B, C, D ...) without the letter labels.
- answer: the letter of the correct choice ONLY if the paper itself states it for THAT question number (an answer key entry, a marked/underlined/bold choice or "Answer: X"). Otherwise answer MUST be null, even if you know the answer. Never solve questions yourself.
- answer_evidence: the exact words copied from the paper that show this question's answer (e.g. "1-B" or "Answer: C"); null when the paper shows none.
- marks: the marks shown for the question, or 1 if not shown.

FORMULAS AND SYMBOLS (mathematics, physics, chemistry, economics and any other subject):
- Write every formula, equation, expression, fraction, power, index, root, subscript, Greek letter, vector, angle, unit with powers, inequality, set, matrix, limit, integral, sum and special sign in LaTeX between single dollar signs for inline maths, e.g. $x^2 - 5x + 6 = 0$, $\\frac{3}{4}$, $\\sqrt{2}$, $v = u + at$, $9.8\\,\\text{m/s}^2$, $\\theta = 30^\\circ$, $\\vec{F}$, $\\Omega$, $\\int_0^1 x\\,dx$.
- Put a long or stand-alone equation on its own line between double dollar signs: $$...$$.
- Chemistry: write chemical formulas, ions and reactions with \\ce{} inside dollar signs, e.g. $\\ce{H2SO4}$, $\\ce{Fe^{3+}}$, $\\ce{2H2 + O2 -> 2H2O}$, $\\ce{N2 + 3H2 <=> 2NH3}$.
- Use the same notation inside options.
- A dollar sign meaning money must be written as \\$ (e.g. \\$500). Ethiopian Birr stays as "Birr".
- Copy the maths exactly as printed; never simplify or solve it.

READING PASSAGES (English and any subject with a shared text, poem, dialogue, letter, case study or data description):
- Put each shared passage ONCE in "passages" with a short id ("P1", "P2" ...). Copy it completely and exactly, including its title, with paragraph breaks as \\n\\n and line numbers if printed.
- Set passage_id on EVERY question that uses that passage; null for other questions.
- The general instruction line ("Read the passage and answer questions 1-5") is not part of the passage.

FIGURES (graphs, diagrams, drawings, charts, circuits, geometry figures, maps, tables of data, chemical structures, apparatus):
- When a question needs a picture or table from the paper, set figure. Otherwise figure is null.
- For page pictures: source "page", index = the page number given before that page picture, and the box around the figure as x0,y0 (top-left) and x1,y1 (bottom-right) in units of 0-1000 of that page's width and height. Make the box enclose the whole figure with its labels, axes, scales and caption, but not the question wording or other questions.
- If the choices themselves are pictures (e.g. four graphs), include all choice pictures in one box and make each option a short text naming the label printed under it, e.g. "Graph (A)".
- For Word text: pictures appear as [FIGURE n] markers and are given after the text; use source "embedded", index n and the box 0,0,1000,1000.
- A small data table may instead be written in the question text with one row per line and cells separated by " | ".
- If several questions use the same figure, give each of them that figure.

Ignore headers, general instructions, school names, page numbers and blank answer sheets.`;

const nullable = (s: object) => ({ anyOf: [s, { type: "null" }] });
const schema = jsonSchema<{
  passages: { id: string; text: string }[];
  questions: { text: string; options: string[]; answer: string | null; answer_evidence: string | null; marks: number; passage_id: string | null; figure: { source: "page" | "embedded"; index: number; x0: number; y0: number; x1: number; y1: number } | null }[];
}>({
  type: "object",
  additionalProperties: false,
  required: ["passages", "questions"],
  properties: {
    passages: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string" }, text: { type: "string" } } },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "options", "answer", "answer_evidence", "marks", "passage_id", "figure"],
        properties: {
          text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: ["string", "null"] },
          answer_evidence: { type: ["string", "null"] },
          marks: { type: "number" },
          passage_id: { type: ["string", "null"] },
          figure: nullable({
            type: "object",
            additionalProperties: false,
            required: ["source", "index", "x0", "y0", "x1", "y1"],
            properties: {
              source: { type: "string", enum: ["page", "embedded"] },
              index: { type: "integer" },
              x0: { type: "number" }, y0: { type: "number" }, x1: { type: "number" }, y1: { type: "number" },
            },
          }),
        },
      },
    },
  },
});

export type PaperInput = { fileName: string; subject?: string | undefined; pages?: string[] | undefined; text?: string | undefined; figures?: string[] | undefined };

const jpeg = (b64: string) => ({ type: "image" as const, image: new URL(`data:image/jpeg;base64,${b64}`) });

function paperContent(input: PaperInput): UserContent {
  const subject = input.subject ? ` Subject: ${input.subject}.` : "";
  const parts: Exclude<UserContent, string> = [];
  if (input.pages?.length) {
    parts.push({ type: "text", text: `Extract all multiple-choice questions from the exam paper "${input.fileName}".${subject} It has ${input.pages.length} page picture(s), each preceded by its page number.` });
    input.pages.forEach((p, i) => { parts.push({ type: "text", text: `Page ${i + 1}:` }); parts.push(jpeg(p)); });
    return parts;
  }
  if (input.text) {
    parts.push({ type: "text", text: `Extract all multiple-choice questions from the exam paper "${input.fileName}".${subject} Its text follows. In the text, ^(x) means superscript and _(x) means subscript.` });
    parts.push({ type: "text", text: input.text });
    input.figures?.forEach((f, i) => { parts.push({ type: "text", text: `[FIGURE ${i + 1}]:` }); parts.push(jpeg(f)); });
    return parts;
  }
  throw new Error("This file type can't be read. Upload a PDF, Word (.docx), photo or text file.");
}

function friendly(err: unknown): Error {
  const status = (err as { statusCode?: number })?.statusCode;
  console.error("Paper scan failed", status, err instanceof Error ? err.message : err);
  if (status === 429) return new Error("The paper reader is busy. Please try again in a minute.");
  if (status === 402) return new Error("The paper reader has run out of AI credits. Please tell the IT Admin.");
  if (status === 403) return new Error("The paper reader is not allowed for this school's account right now. Please tell the IT Admin.");
  if (status === 400) return new Error("This file could not be read. Make sure it is not empty or password-protected.");
  return new Error("The paper reader is unavailable right now. Please try again.");
}

export async function scanPaper(input: PaperInput): Promise<ScannedQuestion[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Paper scanning is not configured.");
  const content = paperContent(input);
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  let streamError: unknown;
  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content } satisfies ModelMessage],
    output: Output.object({ schema }),
    onError: ({ error }) => { streamError = error; },
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  try {
    const output = await result.output;
    return normalizeScanned(output);
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err) && err.text) {
      try { return normalizeScanned(JSON.parse(err.text)); } catch { /* fall through */ }
    }
    if (streamError || (err as { statusCode?: number })?.statusCode) throw friendly(streamError ?? err);
    console.error("Paper scan produced no questions", err);
    throw new Error("The paper could not be read clearly. Try a clearer PDF or photo.");
  }
}
