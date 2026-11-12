import { describe, expect, it } from "vitest";
import { normalizeScanned } from "@/lib/paper";

describe("scanned exam papers", () => {
  it("keeps questions in paper order with each choice in its A–D place", () => {
    const qs = normalizeScanned({ questions: [
      { text: "1. First?", options: ["A. one", "B. two", "C. three", "D. four"], answer: "B", answer_evidence: "1-B", marks: 1 },
      { text: "2) Second?", options: ["w", "x", "y", "z"], answer: "D", answer_evidence: "Answer: D", marks: 2 },
    ] });
    expect(qs.map((q) => q.text)).toEqual(["First?", "Second?"]);
    expect(qs[0]!.options).toEqual(["one", "two", "three", "four"]);
    expect(qs[0]!.answer).toBe(1);
    expect(qs[1]!.answer).toBe(3);
    expect(qs[1]!.marks).toBe(2);
  });

  it("leaves the answer empty when the paper does not show it", () => {
    const [q] = normalizeScanned({ questions: [{ text: "DNA stands for:", options: ["a", "b", "c", "d"], answer: null, answer_evidence: null, marks: 1 }] });
    expect(q!.answer).toBeNull();
  });

  it("ignores a guessed answer that has no proof on the paper", () => {
    const [q] = normalizeScanned({ questions: [{ text: "Q?", options: ["a", "b", "c", "d"], answer: "A", answer_evidence: null, marks: 1 }] });
    expect(q!.answer).toBeNull();
  });

  it("skips items that are not multiple-choice questions", () => {
    expect(normalizeScanned({ questions: [{ text: "Instructions", options: [], answer: null, answer_evidence: null, marks: 1 }] })).toEqual([]);
  });
});
