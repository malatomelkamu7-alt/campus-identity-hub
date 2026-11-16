import { useMemo, useState } from "react";
import { Maximize2, X } from "lucide-react";
import katex from "katex";
import "katex/contrib/mhchem";
import { splitMath } from "@/lib/math-text";
import { givenBlocks } from "@/lib/paper";

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

/** A reading passage, paragraph, poem or case study that belongs to one or more questions; it can be opened large for easy reading. */
export function PassageBox({ text, label, className = "" }: { text: string; label?: string | undefined; className?: string }) {
  const [open, setOpen] = useState(false);
  const title = label ?? "Read the passage";
  return (
    <>
      <div className={`rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 ${className}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</span>
          <button type="button" onClick={() => setOpen(true)} className="flex shrink-0 items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-xs text-primary hover:bg-primary/10"><Maximize2 className="h-3 w-3" />Read large</button>
        </div>
        <div className="max-h-80 overflow-y-auto pr-1 text-sm leading-relaxed sm:text-base"><MathText text={text} /></div>
      </div>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-40 flex flex-col bg-background/95 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 pb-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">{title}</span>
            <button type="button" onClick={() => setOpen(false)} className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary"><X className="h-4 w-4" />Back to question</button>
          </div>
          <div className="glass mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 text-base leading-loose sm:p-6 sm:text-lg"><MathText text={text} /></div>
        </div>
      )}
    </>
  );
}

/** The paper's "Given" sheet: values, constants, formulas and data tables, with tables drawn as real tables. */
export function GivenSheet({ text, className = "" }: { text: string; className?: string }) {
  const blocks = useMemo(() => givenBlocks(text), [text]);
  return (
    <div className={`space-y-3 text-sm leading-relaxed sm:text-base ${className}`}>
      {blocks.map((b, i) => b.kind === "text"
        ? <div key={i}><MathText text={b.text} /></div>
        : (
          <div key={i} className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <tbody>{b.rows.map((r, j) => (
                <tr key={j} className={j === 0 ? "bg-primary/10 font-semibold" : "border-t border-border"}>
                  {r.map((c, k) => <td key={k} className="border-l border-border px-2 py-1.5 first:border-l-0"><MathText text={c} /></td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

/** A graph, diagram or table picture cut from the paper. */
export function FigureImage({ src, className = "" }: { src: string; className?: string }) {
  return <img src={src} alt="Figure for this question" draggable={false} className={`mx-auto max-h-96 w-auto max-w-full rounded-lg border border-border object-contain ${className}`} />;
}
