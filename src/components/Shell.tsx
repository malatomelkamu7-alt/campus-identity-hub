import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Crown, Cpu, BookOpen, GraduationCap, MessageCircle, BadgeCheck } from "lucide-react";
import { usePublicState } from "@/lib/live";
import { isPageVisible } from "@/lib/admin-rules";

const roles = [
  { to: "/director", label: "Director", icon: Crown },
  { to: "/it-admin", label: "IT Admin", icon: Cpu },
  { to: "/teacher", label: "Teacher", icon: BookOpen },
  { to: "/student", label: "Student", icon: GraduationCap },
] as const;

/** Staff links appear only once the IT Admin's visibility setting is known, so hidden pages never flash into view. */
export function visibleRoles<T extends { to: string }>(list: readonly T[], hidden: string[] | undefined) {
  return list.filter((r) => r.to === "/student" || (hidden !== undefined && isPageVisible(r.to.slice(1), hidden)));
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const SUPPORT_URL = "https://t.me/bhsss_admin";
export function HelpLink() {
  return <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="help-link"><MessageCircle className="h-4 w-4" />Need help? Contact us</a>;
}

export function Shell({ children, title, subtitle, help = false }: { children: ReactNode; title: string; subtitle: string; help?: boolean }) {
  const { data } = usePublicState();
  const live = !!data?.examLive;
  const published = !!data?.resultsPublished;
  const shownRoles = visibleRoles(roles, data?.hiddenStaffRoles);
  return (
    <div className="relative min-h-screen">
      <img src="/school-logo.jpg" alt="" aria-hidden className="pointer-events-none fixed left-1/2 top-1/2 -z-0 w-[560px] max-w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.05]" />
      <header className="header-premium z-30 backdrop-blur-xl md:sticky md:top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4 sm:py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="logo-ring shrink-0"><img src="/school-logo.jpg" alt="Burka Harbu logo" className="block h-9 w-9 rounded-full sm:h-11 sm:w-11" /></span>
            <div className="min-w-0 leading-tight">
              <div className="text-premium truncate font-display text-sm font-bold sm:text-base">Burka Harbu Special Secondary School</div>
              <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent" />Grade 12 National Exam Platform</div>
            </div>
          </Link>
          <nav className="-mx-1 flex w-full gap-1 overflow-x-auto rounded-full border border-border bg-secondary/60 p-1 shadow-inner md:mx-0 md:ml-auto md:w-auto">
            {shownRoles.map((r) => (
              <Link key={r.to} to={r.to} className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs sm:px-3 font-medium text-muted-foreground transition hover:text-foreground"
                activeProps={{ className: "bg-primary text-primary-foreground glow hover:text-primary-foreground" }}>
                <r.icon className="h-3.5 w-3.5" /> {r.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="status-pill"><span className={live ? "dot-live" : "dot-off"} /> Exam {live ? "Live" : "Locked"}</span>
            <span className="status-pill"><span className={published ? "dot-live" : "dot-off"} /> Results {published ? "Out" : "Hidden"}</span>
          </div>
        </div>
      </header>
      <main className="relative mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-8">
        <div className="mb-5 sm:mb-8">
          <h1 className="text-2xl font-bold sm:text-3xl md:text-4xl">{title}</h1>
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        </div>
        {children}
        {help && <div className="mt-10 flex justify-center"><HelpLink /></div>}
      </main>
    </div>
  );
}

export function Panel({ title, icon, children, className = "", action }: { title: string; icon?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`glass p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        <h2 className="min-w-0 flex-1 break-words text-base font-semibold">{title}</h2>
        {action && <div className="ml-auto max-w-full">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full border transition ${on ? "border-accent bg-accent/30 glow" : "border-border bg-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${on ? "left-6 bg-accent" : "left-0.5 bg-muted-foreground"}`} />
    </button>
  );
}

export function Btn({ children, variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "accent" }) {
  const v = {
    primary: "bg-primary text-primary-foreground hover:brightness-110 glow",
    accent: "bg-accent text-accent-foreground hover:brightness-110",
    ghost: "border border-border bg-secondary/40 hover:bg-secondary",
    danger: "bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25",
  }[variant];
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${v} ${className}`}>{children}</button>;
}

export function Avatar({ name, className = "h-12 w-12" }: { name: string; className?: string }) {
  const init = name.split(" ").slice(0, 2).map((n) => n[0]).join("");
  return <div className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/40 to-accent/30 font-display font-bold ring-1 ring-primary/40 ${className}`}>{init}</div>;
}
