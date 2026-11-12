/** Cross-browser fullscreen helpers (standard API plus the older Safari/WebKit names). */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function fullscreenSupported(doc: Document = document) {
  const d = doc as FsDoc, el = doc.documentElement as FsEl;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled) && !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function inFullscreen(doc: Document = document) {
  const d = doc as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Must be called from a tap/click. Also asks Chrome to hold the Escape key so one press cannot leave the exam. */
export async function enterFullscreen(doc: Document = document) {
  if (inFullscreen(doc)) return true;
  const el = doc.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
  } catch { return false; }
  const kb = (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard;
  kb?.lock?.(["Escape"]).catch(() => {});
  return inFullscreen(doc);
}

export function exitFullscreen(doc: Document = document) {
  if (!inFullscreen(doc)) return;
  const d = doc as FsDoc;
  try { const r = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.(); if (r && "catch" in r) r.catch(() => {}); } catch { /* ignore */ }
}

export const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;
