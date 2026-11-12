import { describe, expect, it } from "vitest";
import { scoreBands, bandOf } from "../lib/results";
import { academicYear, sessionBlocksSignIn } from "../lib/admin-rules";
import { remainingSeconds } from "../lib/exam-timing";

describe("score bands", () => {
  it("places totals out of 500 into 400/300/200 bands", () => {
    expect(bandOf(400)).toBe("400");
    expect(bandOf(399)).toBe("300");
    expect(bandOf(200)).toBe("200");
    expect(bandOf(199)).toBe("0");
  });
  it("counts male and female students separately and skips students without marks", () => {
    const rows = scoreBands([
      { gender: "M", scores: { Physics: 90, Chemistry: 90, Biology: 90, Mathematics: 90, English: 90 } },
      { gender: "F", scores: { Physics: 80, Chemistry: 80, Biology: 80, Mathematics: 80, English: 80 } },
      { gender: "F", scores: { Physics: 60, Chemistry: 60, Biology: 60, Mathematics: 60, English: 60 } },
      { gender: "M", scores: {} },
    ]);
    expect(rows.find((r) => r.key === "400")).toMatchObject({ male: 1, female: 1, total: 2 });
    expect(rows.find((r) => r.key === "300")).toMatchObject({ male: 0, female: 1, total: 1 });
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(3);
  });
});

describe("school-year batches", () => {
  it("labels November 2026 as 2026/27 and May 2027 as the same year", () => {
    expect(academicYear(new Date(2026, 10, 1))).toBe("2026/27");
    expect(academicYear(new Date(2027, 4, 1))).toBe("2026/27");
    expect(academicYear(new Date(2027, 8, 15))).toBe("2027/28");
  });
});

describe("single student sign-in", () => {
  const now = Date.parse("2026-11-01T10:00:00Z");
  it("blocks a second sign-in while the exam is live and the first session is active", () => {
    expect(sessionBlocksSignIn(true, "2026-11-01T09:59:30Z", now)).toBe(true);
  });
  it("allows sign-in when the exam is not live or the old session went quiet", () => {
    expect(sessionBlocksSignIn(false, "2026-11-01T09:59:30Z", now)).toBe(false);
    expect(sessionBlocksSignIn(true, "2026-11-01T09:55:00Z", now)).toBe(false);
  });
});

describe("paused timer", () => {
  it("freezes remaining time at the pause moment", () => {
    const deadline = "2026-11-01T10:30:00Z";
    expect(remainingSeconds(deadline, Date.parse("2026-11-01T10:10:00Z"))).toBe(1200);
  });
});

import { bandsFor, maxTotal, matchesPerson } from "../lib/results";
describe("SAT changes the score summary to 600", () => {
  it("uses 600 as the maximum when SAT is included, 500 otherwise", () => {
    expect(maxTotal(true)).toBe(600);
    expect(maxTotal(false)).toBe(500);
  });
  it("bands out of 600 start at 500, 400 and 300", () => {
    expect(bandsFor(600).map((b) => b.key)).toEqual(["500", "400", "300", "0"]);
    expect(bandOf(520, 600)).toBe("500");
    expect(bandOf(450, 600)).toBe("400");
    expect(bandOf(299, 600)).toBe("0");
  });
});

describe("IT Admin search", () => {
  it("finds a person by ID even without dashes or capitals", () => {
    expect(matchesPerson("bh12a01", { name: "Abebe Kebede", id: "BH-12A-01" })).toBe(true);
    expect(matchesPerson("BH-12A-01", { name: "Abebe Kebede", id: "BH-12A-01" })).toBe(true);
    expect(matchesPerson("kebede", { name: "Abebe Kebede", id: "BH-12A-01" })).toBe(true);
    expect(matchesPerson("BH-12B", { name: "Abebe Kebede", id: "BH-12A-01" })).toBe(false);
  });
});
