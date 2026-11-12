import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, ScanFace } from "lucide-react";
import { Btn } from "@/components/Shell";

/** Live-only capture: no file picker, the photo must come from the camera stream. */
export function LiveCamera({ onCapture }: { onCapture: (dataUrl: string | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [err, setErr] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const gen = useRef(0);
  const start = async () => {
    const my = ++gen.current;
    setErr(""); setReady(false);
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      if (my === gen.current) setErr("Camera access is needed for live verification. Allow camera permission and try again.");
      return;
    }
    if (my !== gen.current) { s.getTracks().forEach((t) => t.stop()); return; }
    stream.current = s;
    attach();
  };
  // Connects the live stream to the <video>; also runs after "Retake" re-renders the video element.
  const attach = () => {
    const v = video.current, s = stream.current;
    if (!v || !s || v.srcObject === s) return;
    v.srcObject = s;
    const ok = () => { if (v.videoWidth > 0) setReady(true); };
    v.onloadedmetadata = ok; v.onloadeddata = ok; v.onplaying = ok;
    v.play().catch(() => {});
  };
  useEffect(() => { if (!shot) attach(); });
  const stop = () => { gen.current++; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  useEffect(() => { start(); return stop; }, []);

  const capture = () => {
    const v = video.current; if (!v || !v.videoWidth || !v.videoHeight) { setErr("The camera is not ready yet. Wait a moment and try again."); return; }
    const size = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement("canvas"); c.width = 480; c.height = 480;
    const ctx = c.getContext("2d")!;
    ctx.translate(480, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 480, 480);
    const url = c.toDataURL("image/jpeg", 0.85);
    setShot(url); onCapture(url); stop();
  };

  const countdown = () => {
    let n = 3; setCount(n);
    const t = setInterval(() => { n -= 1; if (n === 0) { clearInterval(t); setCount(null); capture(); } else setCount(n); }, 1000);
  };

  const retake = () => { setShot(null); onCapture(null); setErr(""); start(); };

  return (
    <div className="space-y-3">
      <div className="tile relative mx-auto aspect-square w-full max-w-xs overflow-hidden p-0">
        {shot ? <img src={shot} alt="Your captured photo" className="h-full w-full object-cover" />
          : <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />}
        {!shot && <div className="pointer-events-none absolute inset-8 rounded-full border-2 border-dashed border-primary/60" />}
        {count !== null && <div className="absolute inset-0 flex items-center justify-center font-display text-7xl font-bold text-primary">{count}</div>}
        {!shot && !ready && !err && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"><ScanFace className="mr-2 h-5 w-5" />Starting camera…</div>}
      </div>
      {err && <p className="text-center text-xs text-destructive">{err}</p>}
      <div className="flex justify-center gap-2">
        {shot ? <Btn type="button" variant="ghost" onClick={retake}><RefreshCw className="h-4 w-4" />Retake</Btn>
          : err ? <Btn type="button" variant="ghost" onClick={start}><RefreshCw className="h-4 w-4" />Try again</Btn>
          : <Btn type="button" disabled={!ready || count !== null} onClick={countdown}><Camera className="h-4 w-4" />Take live photo</Btn>}
      </div>
      {!shot && <p className="text-center text-xs text-muted-foreground">Look straight at the camera, face inside the circle, good light.</p>}
    </div>
  );
}
