import { describe, expect, it } from "vitest";
import { matchesClassFilter, classFilterOptions, studentDetailsSchema, isValidRegisteredDate } from "@/lib/admin-rules";

const natA = { stream: "Natural Science", section: "A" };
const natB = { stream: "Natural Science", section: "B" };
const soc = { stream: "Social Science", section: "C" };

describe("IT Admin stream and section filter", () => {
  it("Natural Science Section A shows only section A naturals", () => {
    expect([natA, natB, soc].filter((p) => matchesClassFilter("Natural Science:A", p))).toEqual([natA]);
  });
  it("Social Science filters as one group", () => {
    expect([natA, natB, soc].filter((p) => matchesClassFilter("Social Science", p))).toEqual([soc]);
  });
  it("offers section choices for Natural Science only", () => {
    expect(classFilterOptions([natA, natB, soc]).map((o) => o.value)).toEqual(["Natural Science", "Natural Science:A", "Natural Science:B", "Social Science"]);
  });
});

describe("IT Admin student edit", () => {
  it("refuses a registered date in the future", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    expect(isValidRegisteredDate("2026-11-09T12:00:00Z", now)).toBe(false);
    expect(isValidRegisteredDate("2026-10-01T08:00:00Z", now)).toBe(true);
  });
  it("only accepts Natural or Social Science for students", () => {
    expect(studentDetailsSchema.safeParse({ grade: "12", section: "A", stream: "Both", gender: "M", batch: "2026/27" }).success).toBe(false);
  });
});
