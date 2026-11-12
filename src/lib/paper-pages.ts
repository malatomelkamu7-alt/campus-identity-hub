/* Browser-only: turns an uploaded paper into page pictures and cuts figures out of them.
   Import this module dynamically from event handlers only. */
import { MAX_PAPER_PAGES, paddedBox, edgeTrim } from "@/lib/paper";

const PAGE_WIDTH = 1500;

export async function pdfToCanvases(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  if (doc.numPages > MAX_PAPER_PAGES) throw new Error(`This PDF has ${doc.numPages} pages. Please upload at most ${MAX_PAPER_PAGES} pages at a time (split the paper into parts).`);
  const out: HTMLCanvasElement[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, PAGE_WIDTH / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    out.push(canvas);
  }
  await task.destroy();
  return out;
}

/** Draws a photo or picture onto a white canvas, turned the right way up and no larger than maxSide. */
export async function imageToCanvas(blob: Blob, maxSide = 2000): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * s)); canvas.height = Math.max(1, Math.round(bmp.height * s));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

export const canvasBase64 = (c: HTMLCanvasElement, quality = 0.82) => c.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
export const canvasDataUrl = (c: HTMLCanvasElement, quality = 0.85) => c.toDataURL("image/jpeg", quality);

/** Cuts a figure (box in 0–1000 page units) out of a page, with a small margin, at most 1400px wide. */
export function cropFigure(page: HTMLCanvasElement, box: [number, number, number, number]): HTMLCanvasElement {
  const [x0, y0, x1, y1] = paddedBox(box);
  const sx = Math.round((x0 / 1000) * page.width);
  let sy = Math.round((y0 / 1000) * page.height);
  const sw = Math.max(1, Math.round(((x1 - x0) / 1000) * page.width));
  let sh = Math.max(1, Math.round(((y1 - y0) / 1000) * page.height));
  // Drop slivers of the question text above or below that the box clipped.
  const px = page.getContext("2d")!.getImageData(sx, sy, sw, sh).data;
  const ink = Array.from({ length: sh }, (_, r) => {
    for (let c = 0; c < sw; c += 2) { const k = (r * sw + c) * 4; if (px[k]! + px[k + 1]! + px[k + 2]! < 420) return true; }
    return false;
  });
  const [top, end] = edgeTrim(ink);
  sy += top; sh = end - top;
  const s = Math.min(1, 1400 / sw);
  const c = document.createElement("canvas");
  c.width = Math.round(sw * s); c.height = Math.round(sh * s);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(page, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** Word papers: text with [FIGURE n] where each picture sits, the pictures themselves, and whether Word equations were found. */
export async function readDocx(file: File): Promise<{ text: string; figures: HTMLCanvasElement[]; hasEquations: boolean }> {
  const buf = await file.arrayBuffer();
  const [mammoth, { default: JSZip }] = await Promise.all([import("mammoth"), import("jszip")]);
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const hasEquations = /<m:oMath[\s>]/.test(xml);
  const figures: HTMLCanvasElement[] = [];
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      try {
        if (!/^image\/(png|jpe?g|gif|bmp|webp)$/i.test(image.contentType)) return { src: "", alt: "" };
        const b64 = await image.readAsBase64String();
        const blob = await (await fetch(`data:${image.contentType};base64,${b64}`)).blob();
        const c = await imageToCanvas(blob, 1400);
        if (c.width < 24 || c.height < 24) return { src: "", alt: "" };
        figures.push(c);
        return { src: "", alt: `[FIGURE ${figures.length}]` };
      } catch { return { src: "", alt: "" }; }
    }),
  });
  return { text: htmlToPaperText(html), figures, hasEquations };
}

/** Plain text that keeps paragraphs, list items, table rows and figure markers in place. */
export function htmlToPaperText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? "";
    if (!(n instanceof Element)) return "";
    const tag = n.tagName.toLowerCase();
    if (tag === "img") return n.getAttribute("alt") ? `\n${n.getAttribute("alt")}\n` : "";
    if (tag === "br") return "\n";
    if (tag === "sup") return `^(${Array.from(n.childNodes).map(walk).join("")})`;
    if (tag === "sub") return `_(${Array.from(n.childNodes).map(walk).join("")})`;
    if (tag === "tr") return Array.from(n.children).map((c) => walk(c).trim()).join(" | ") + "\n";
    const inner = Array.from(n.childNodes).map(walk).join("");
    if (tag === "table") return `\n[TABLE]\n${inner}[END TABLE]\n`;
    if (tag === "li") return `- ${inner}\n`;
    if (/^(p|h[1-6]|div|ul|ol)$/.test(tag)) return `${inner}\n`;
    return inner;
  };
  return walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
}
