import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, Cpu, BookOpen, GraduationCap } from "lucide-react";
import { HelpLink, visibleRoles } from "@/components/Shell";
import { usePublicState } from "@/lib/live";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Burka Harbu Exam Platform — Grade 12 Mock Tests" },
      { name: "description", content: "Secure online mock exams and results portal for Burka Harbu Special Secondary School Grade 12 students." },
      { property: "og:title", content: "Burka Harbu Exam Platform" },
      { property: "og:description", content: "Secure Grade 12 national exam preparation for Burka Harbu Special Secondary School." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const roles = [
  { to: "/student", label: "Students", desc: "Grade 12 · exams & results", icon: GraduationCap },
  { to: "/teacher", label: "Teachers", desc: "Question banks", icon: BookOpen },
  { to: "/director", label: "Director", desc: "Exam control", icon: Crown },
  { to: "/it-admin", label: "IT Admin", desc: "Dashboard", icon: Cpu },
] as const;

function Index() {
  const { data } = usePublicState();
  const shown = visibleRoles(roles, data?.hiddenStaffRoles);
  const cols = shown.length >= 4 ? "md:grid-cols-4" : shown.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="flex flex-col items-center text-center">
        <img src="/school-logo.jpg" alt="Burka Harbu Special Secondary School logo" className="h-28 w-28 rounded-full ring-2 ring-primary/50 glow sm:h-40 sm:w-40" />
        <h1 className="mt-6 text-2xl font-bold sm:text-3xl md:text-4xl">Burka Harbu <span className="text-accent">Special Secondary School</span></h1>
        <p className="mt-3 text-muted-foreground">Grade 12 Exam Portal</p>
      </div>
      <div className={`mx-auto mt-10 grid max-w-xl grid-cols-2 gap-3 sm:gap-4 md:max-w-none ${cols} ${shown.length === 1 ? "max-w-xs grid-cols-1" : ""}`}>
        {shown.map((r) => (
          <Link key={r.to} to={r.to} className="tile tile-hover">
            <span className="tile-icon"><r.icon className="h-5 w-5" /></span>
            <h2 className="mt-4 text-lg font-semibold">{r.label}</h2>
            <p className="text-sm text-muted-foreground">{r.desc}</p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-center text-muted-foreground">Choose who you are to enter the exam portal.</p>
      <div className="mt-6 flex justify-center"><HelpLink /></div>
    </div>
  );
}
