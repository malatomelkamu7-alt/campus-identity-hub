import { describe, expect, it } from "vitest";
import { afterWrongPin, pinLockMinutesLeft, inAudience, webhookUrlFor, resultText, statusLines } from "@/lib/telegram-bot";

describe("Telegram bot rules", () => {
  it("pauses result checks for 15 minutes after 3 wrong passcodes", () => {
    const now = Date.parse("2026-11-10T08:00:00Z");
    expect(afterWrongPin(0, now)).toMatchObject({ failures: 1, lockedUntil: null, left: 2 });
    expect(afterWrongPin(1, now)).toMatchObject({ failures: 2, left: 1 });
    const locked = afterWrongPin(2, now);
    expect(locked.left).toBe(0);
    expect(pinLockMinutesLeft(locked.lockedUntil, now)).toBe(15);
    expect(pinLockMinutesLeft(locked.lockedUntil, now + 15 * 60_000)).toBe(0);
  });
  it("sends announcements only to the chosen group and never to chats that blocked the bot", () => {
    const reg = { blocked: false, student_code: "BH-12A-01", stream: "Natural Science" };
    const guest = { blocked: false, student_code: null, stream: null };
    expect(inAudience("all", guest)).toBe(true);
    expect(inAudience("registered", guest)).toBe(false);
    expect(inAudience("unregistered", reg)).toBe(false);
    expect(inAudience("Natural Science", reg)).toBe(true);
    expect(inAudience("Social Science", reg)).toBe(false);
    expect(inAudience("all", { ...reg, blocked: true })).toBe(false);
  });
  it("registers the public address, not the signed-in editor preview", () => {
    expect(webhookUrlFor("https://id-preview--abc-123.lovable.app")).toBe("https://project--abc-123-dev.lovable.app/api/public/telegram/webhook");
    expect(webhookUrlFor("https://ashacute.lovable.app")).toBe("https://ashacute.lovable.app/api/public/telegram/webhook");
  });
  it("shows only subject scores and the total, like the portal", () => {
    const t = resultText({ name: "Abdi", grade: "12", section: "A", stream: "Natural Science", subjects: ["Physics", "Biology"], scores: { Physics: 80 } });
    expect(t).toContain("Physics: <b>80</b>");
    expect(t).toContain("Biology: <b>—</b>");
    expect(t).toContain("Total: 80 / 200");
  });
  it("says closed when registration and results are closed", () => {
    const t = statusLines({ registrationOpen: false, examLive: true, resultsPublished: false });
    expect(t).toContain("Registration: <b>CLOSED</b>");
    expect(t).toContain("Exam: <b>LIVE</b>");
    expect(t).toContain("Results: <b>CLOSED</b>");
  });
});
