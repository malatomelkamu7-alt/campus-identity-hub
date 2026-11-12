const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
/** Registered photos compared per AI request; batches run in parallel so large schools stay fast. */
const BATCH = 8;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

async function ask(content: Part[]): Promise<Record<string, unknown>> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Face verification is not configured.");
  let res: Response;
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content }], response_format: { type: "json_object" } }),
    });
  } catch (e) {
    console.error("Face check network error", e);
    throw new Error("Face verification is unavailable right now. Please try again.");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Face check failed [${res.status}]: ${body}`);
    if (res.status === 402) throw new Error("Face verification is paused because the school's AI credit is used up. Please tell IT Admin.");
    if (res.status === 429) throw new Error("Face verification is busy. Please try again in a minute.");
    throw new Error("Face verification is unavailable right now. Please try again.");
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseJson(json.choices?.[0]?.message?.content ?? "");
}

/** Reads the model's JSON reply, tolerating code fences or extra words around it. */
export function parseJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return {}; }
}

const yes = (v: unknown) => v === true || v === "true" || v === "yes";
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

export const COVERED_MSG = "Face verification failed: Your face must be completely uncovered and visible without masks or coverings.";
export const NO_FACE_MSG = "Face verification failed: exactly one face must be clearly visible. Sit alone, face the camera and try again.";
export const UNCLEAR_MSG = "Face verification failed: the photo is too dark or blurry. Move to better light, hold still and retake it.";
export const DUPLICATE_MSG = "This face is already registered to another account.";

/** Decides the outcome of the uncovered-face check from the model's reply (null = passed). */
export function uncoveredVerdict(r: Record<string, unknown>): string | null {
  const faces = num(r["face_count"]);
  if (faces !== 1) return NO_FACE_MSG;
  if (r["clear"] !== undefined && !yes(r["clear"])) return UNCLEAR_MSG;
  if (!yes(r["fully_uncovered"])) return COVERED_MSG;
  return null;
}

/** Throws if no single, fully uncovered, clearly visible face is in the photo. */
export async function checkUncovered(dataUrl: string) {
  const r = await ask([
    { type: "text", text: 'Inspect this live webcam photo for a school exam identity check. Reply only as json: {"face_count": number, "clear": boolean, "fully_uncovered": boolean, "reason": string}. face_count = number of human faces. clear = false only if the face is too dark, blurred or cut off to recognise. fully_uncovered = false if a mask, scarf over mouth or nose, sunglasses, hand, hood or any object hides part of the face. Normal clear eyeglasses, hair and head scarves that leave the whole face visible are allowed (fully_uncovered = true).' },
    { type: "image_url", image_url: { url: dataUrl } },
  ]);
  const verdict = uncoveredVerdict(r);
  if (verdict) throw new Error(verdict);
}

/** Decides whether a duplicate-check reply means the new face matches a registered one. */
export function isDuplicate(r: Record<string, unknown>, batchSize: number): boolean {
  const idx = num(r["match_index"]);
  const conf = num(r["confidence"]);
  return Number.isInteger(idx) && idx >= 1 && idx <= batchSize && (Number.isNaN(conf) ? true : conf >= 0.8);
}

/** Throws if the new face matches any of the registered photos (data URLs). */
export async function checkNotDuplicate(dataUrl: string, existing: string[]) {
  const batches: string[][] = [];
  for (let i = 0; i < existing.length; i += BATCH) batches.push(existing.slice(i, i + BATCH));
  const results = await Promise.all(batches.map((batch) => ask([
    { type: "text", text: `Image 0 is a new student. Images 1-${batch.length} are students who are already registered. Is the person in image 0 the same human being as the person in any of images 1-${batch.length}? Judge only by facial identity (face shape, eyes, nose, mouth), never by clothing, uniform, hairstyle, lighting or background; different people in the same school uniform are NOT a match. Reply only as json: {"match_index": number|null, "confidence": number between 0 and 1}.` },
    { type: "image_url", image_url: { url: dataUrl } },
    ...batch.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ]).then((r) => isDuplicate(r, batch.length))));
  if (results.some(Boolean)) throw new Error(DUPLICATE_MSG);
}
