import { useMemo } from "react";
import katex from "katex";
import "katex/contrib/mhchem";
import { splitMath } from "@/lib/math-text";

/** Shows question text with formulas, symbols and chemical equations drawn properly; line breaks are kept. */
export function MathText({ text, className = "" }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMath(text).map((p) => {
    if (p.kind === "text") return p;
    try {
      return { ...p, html: katex.renderToString(p.value, { displayMode: p.display, throwOnError: true, strict: "ignore", trust: false }) };
    } catch {
      return { kind: "text" as const, value: p.display ? `$$${p.value}$$` : `$${p.value}$` };
    }
  }), [text]);
  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((p, i) => "html" in p
        ? <span key={i} className={p.display ? "my-2 block overflow-x-auto overflow-y-hidden" : "inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle"} dangerouslySetInnerHTML={{ __html: p.html }} />
        : <span key={i}>{p.value}</span>)}
    </span>
  );
}

/** A reading passage, poem or case study that belongs to a question. */
export function PassageBox({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`max-h-80 overflow-y-auto rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed sm:p-4 sm:text-base ${className}`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Read the passage</div>
      <MathText text={text} />
    </div>
  );
}

/** A graph, diagram or table picture cut from the paper. */
export function FigureImage({ src, className = "" }: { src: string; className?: string }) {
  return <img src={src} alt="Figure for this question" draggable={false} className={`mx-auto max-h-96 w-auto max-w-full rounded-lg border border-border object-contain ${className}`} />;
}
