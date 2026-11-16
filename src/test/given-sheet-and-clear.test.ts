import { describe, expect, it } from "vitest";
import { readGiven, givenBlocks, bankSaveProblem } from "@/lib/paper";

describe("the paper's Given sheet", () => {
  it("is kept when the paper gives values students may use", () => {
    expect(readGiven({ given: "  Take $g = 10$ m/s²\n\n\n\nUse $\\pi = 3.14$  " })).toBe("Take $g = 10$ m/s²\n\nUse $\\pi = 3.14$");
  });
  it("is empty when the paper gives nothing", () => {
    expect(readGiven({ given: null })).toBeNull();
    expect(readGiven({ given: "None" })).toBeNull();
    expect(readGiven({})).toBeNull();
  });
  it("draws rows with | as a table and keeps other lines as text", () => {
    expect(givenBlocks("Atomic masses:\nElement | Mass\n--- | ---\nH | 1\nO | 16\nUse $R = 8.31$")).toEqual([
      { kind: "text", text: "Atomic masses:" },
      { kind: "table", rows: [["Element", "Mass"], ["H", "1"], ["O", "16"]] },
      { kind: "text", text: "Use $R = 8.31$" },
    ]);
  });
});

describe("removing all questions from a bank", () => {
  it("is allowed for a draft that is not in a live exam", () => {
    expect(bankSaveProblem("draft", 0, false)).toBeNull();
  });
  it("is refused while that paper is in the live exam", () => {
    expect(bankSaveProblem("draft", 0, true)).toMatch(/live exam/);
  });
  it("can't send an empty paper to the Director", () => {
    expect(bankSaveProblem("queued", 0, false)).toMatch(/at least one question/);
    expect(bankSaveProblem("queued", 5, false)).toBeNull();
  });
});
