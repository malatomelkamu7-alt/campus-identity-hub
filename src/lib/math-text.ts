/* Finds maths written between $ signs in question text. Browser and server safe. */
export type MathPart = { kind: "text"; value: string } | { kind: "math"; value: string; display: boolean };

/**
 * `$…$` is inline maths, `$$…$$` is maths on its own line and `\$` is a plain dollar sign.
 * A `$` only opens maths when a non-space follows it, and only closes when a non-space comes
 * before it and no digit after it, so prices like "$5 and $10" stay plain text.
 */
export function splitMath(src: string): MathPart[] {
  const out: MathPart[] = [];
  let buf = "";
  const flush = () => { if (buf) out.push({ kind: "text", value: buf }); buf = ""; };
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "\\" && src[i + 1] === "$") { buf += "$"; i += 2; continue; }
    if (c === "$" && src[i + 1] === "$") {
      const end = src.indexOf("$$", i + 2);
      if (end > i + 2) { flush(); out.push({ kind: "math", value: src.slice(i + 2, end).trim(), display: true }); i = end + 2; continue; }
    } else if (c === "$" && src[i + 1] && !/\s/.test(src[i + 1]!)) {
      let j = i + 1, close = -1;
      while (j < src.length) {
        const d = src[j]!;
        if (d === "\\") { j += 2; continue; }
        if (d === "$") { if (!/\s/.test(src[j - 1]!) && !/\d/.test(src[j + 1] ?? "")) close = j; break; }
        if (d === "\n" && src[j + 1] === "\n") break;
        j++;
      }
      if (close > i + 1) { flush(); out.push({ kind: "math", value: src.slice(i + 1, close), display: false }); i = close + 1; continue; }
    }
    buf += c; i++;
  }
  flush();
  return out;
}

export const hasMath = (s: string) => splitMath(s).some((p) => p.kind === "math");
