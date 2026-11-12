import { describe, expect, it } from "vitest";
import { normalizeScanned, paddedBox, groupByPassage, edgeTrim } from "@/lib/paper";
import { splitMath } from "@/lib/math-text";

describe("formulas in question text", () => {
  it("finds inline and own-line maths", () => {
    expect(splitMath("Solve $x^2=4$ now")).toEqual([{ kind: "text", value: "Solve " }, { kind: "math", value: "x^2=4", display: false }, { kind: "text", value: " now" }]);
    expect(splitMath("$$\\frac{1}{2}$$")).toEqual([{ kind: "math", value: "\\frac{1}{2}", display: true }]);
  });
  it("keeps prices as plain text", () => {
    expect(splitMath("It costs $5 and $10.")).toEqual([{ kind: "text", value: "It costs $5 and $10." }]);
    expect(splitMath("Price \\$500")).toEqual([{ kind: "text", value: "Price $500" }]);
  });
});

describe("passages and figures from scanned papers", () => {
  const scanned = normalizeScanned({
    passages: [{ id: "P1", text: "Once upon a time..." }],
    questions: [
      { text: "Who?", options: ["a", "b", "c", "d"], answer: null, answer_evidence: null, marks: 1, passage_id: "P1", figure: null },
      { text: "Read the graph", options: ["a", "b", "c", "d"], answer: null, answer_evidence: null, marks: 1, passage_id: null, figure: { source: "page", index: 2, x0: 100, y0: 200, x1: 600, y1: 500 } },
      { text: "Tiny box", options: ["a", "b"], answer: null, answer_evidence: null, marks: 1, passage_id: "missing", figure: { source: "page", index: 1, x0: 10, y0: 10, x1: 12, y1: 12 } },
    ],
  });
  it("attaches the shared passage to its question", () => {
    expect(scanned[0]!.passage).toBe("Once upon a time...");
    expect(scanned[2]!.passage).toBeNull();
  });
  it("keeps a figure's page and box, and drops boxes too small to be a figure", () => {
    expect(scanned[1]!.figure).toEqual({ source: "page", index: 2, box: [100, 200, 600, 500] });
    expect(scanned[2]!.figure).toBeNull();
  });
  it("widens a figure box without going off the page", () => {
    expect(paddedBox([10, 100, 990, 500], 25)).toEqual([0, 75, 1000, 525]);
  });
  it("drops a clipped text line at the top or bottom of a cut-out figure", () => {
    const rows = (pattern: string) => [...pattern].map((c) => c === "#");
    // 3 inked rows of clipped text, a gap, the figure, a gap, 2 inked rows of clipped text
    expect(edgeTrim(rows("###......" + "#".repeat(80) + "......##"), 0.07, 4)).toEqual([3, 95]);
    // a figure that starts right at the edge with no gap is left whole
    expect(edgeTrim(rows("#".repeat(60) + "...."), 0.07, 4)).toEqual([0, 64]);
  });
  it("keeps questions of one passage together when the paper is shuffled", () => {
    const qs = [{ id: 1, passage: "P" }, { id: 2, passage: "P" }, { id: 3 }, { id: 4, passage: "Q" }];
    expect(groupByPassage(qs).map((g) => g.map((q) => q.id))).toEqual([[1, 2], [3], [4]]);
  });
});
