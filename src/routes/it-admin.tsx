import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Shell, Btn } from "@/components/Shell";
import { RegisteredStudents } from "@/components/RegisteredStudents";
import { adminDirectory } from "@/lib/students.functions";

export const Route = createFileRoute("/it-admin")({
  head: () => ({ meta: [
    { title: "IT Admin — Burka Harbu Exams" },
    { name: "description", content: "PIN-protected student registration and school staff management." },
    { property: "og:title", content: "IT Admin — Burka Harbu Exams" },
    { property: "og:description", content: "Private identity management for Burka Harbu Exam Portal." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ITAdmin,
});

type Directory = Awaited<ReturnType<typeof adminDirectory>>;
function ITAdmin() {
  const load = useServerFn(adminDirectory);
  const [pin, setPin] = useState("");
  const [verifiedPin, setVerifiedPin] = useState<string | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = () => { setDirectory(null); setVerifiedPin(null); setPin(""); setError(""); };
  return <Shell title="IT Admin" subtitle="Burka Harbu Exam Portal">
    {directory && verifiedPin ? <RegisteredStudents passcode={verifiedPin} initial={directory} onLock={lock} /> :
      <form className="tile mx-auto max-w-sm space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError("");
        try { const data = await load({ data: { passcode: pin } }); setDirectory(data); setVerifiedPin(pin); setPin(""); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
        finally { setBusy(false); }
      }}>
        <img src="/school-logo.jpg" alt="Burka Harbu logo" className="mx-auto h-20 w-20 rounded-full ring-2 ring-primary/40 glow" />
        <h2 className="text-center text-xl font-semibold">IT Admin sign in</h2>
        <label className="block text-sm" htmlFor="admin-pin">Admin PIN</label>
        <input id="admin-pin" type="password" autoComplete="current-password" className="field" placeholder="Enter your PIN" value={pin} onChange={(e) => setPin(e.target.value)} required maxLength={200} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Btn className="w-full" disabled={busy || !pin}><KeyRound className="h-4 w-4" />{busy ? "Checking…" : "Unlock IT Admin"}</Btn>
      </form>}
  </Shell>;
}
