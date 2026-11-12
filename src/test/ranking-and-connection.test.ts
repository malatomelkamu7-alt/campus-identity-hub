import { describe, expect, it } from "vitest";
import { rankRows } from "../lib/results";
import { backOnline, DISCONNECT_GRACE_SEC, HEARTBEAT_MS, admittedToRoom, activeBankIds } from "../lib/exam-timing";

describe("exam room and both streams", () => {
  it("lets only selected students start when a room list is saved", () => {
    expect(admittedToRoom("BH-12A-01", ["BH-12A-01", "BH-12A-02"])).toBe(true);
    expect(admittedToRoom("BH-12A-03", ["BH-12A-01", "BH-12A-02"])).toBe(false);
    expect(admittedToRoom("BH-12A-03", null)).toBe(true);
  });
  it("keeps a Natural and a Social paper active at the same time", () => {
    expect(activeBankIds({ active_bank_id: "nat", social_bank_id: "soc" })).toEqual(["nat", "soc"]);
    expect(activeBankIds({ active_bank_id: null, social_bank_id: "soc" })).toEqual(["soc"]);
  });
});

describe("results matrix ranking", () => {
  it("ranks highest total first, shares ties and skips students without marks", () => {
    const ranked = rankRows([
      { id: "a", total: 480, hasMarks: true },
      { id: "b", total: 450, hasMarks: true },
      { id: "c", total: 450, hasMarks: true },
      { id: "d", total: 300, hasMarks: true },
      { id: "e", total: 0, hasMarks: false },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4, null]);
  });
});

describe("connection loss", () => {
  it("freezes a silent device's timer within seconds, not minutes", () => {
    expect(DISCONNECT_GRACE_SEC).toBeLessThanOrEqual(6);
    expect(HEARTBEAT_MS).toBeLessThan(DISCONNECT_GRACE_SEC * 1000);
  });
  it("shows a paused student as back online only after they report again", () => {
    const now = Date.parse("2026-11-04T10:05:00Z");
    expect(backOnline("2026-11-04T10:04:55Z", "2026-11-04T10:01:00Z", now)).toBe(true);
    expect(backOnline("2026-11-04T10:01:00Z", "2026-11-04T10:01:00Z", now)).toBe(false);
    expect(backOnline(null, "2026-11-04T10:01:00Z", now)).toBe(false);
  });
});
