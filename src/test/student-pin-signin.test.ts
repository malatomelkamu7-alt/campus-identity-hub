import { describe, expect, it } from "vitest";
import { afterWrongPin, pinLocked, PIN_MAX_FAILURES } from "@/lib/admin-rules";

describe("student sign-in with ID + passcode", () => {
  const t = Date.parse("2026-11-15T03:00:00Z");
  it("allows 4 wrong passcodes without locking", () => {
    expect(afterWrongPin(3, t)).toEqual({ pin_failures: 4, pin_locked_until: null });
  });
  it("locks the ID for 15 minutes on the 5th wrong passcode", () => {
    expect(PIN_MAX_FAILURES).toBe(5);
    const r = afterWrongPin(4, t);
    expect(r.pin_locked_until).toBe(new Date(t + 15 * 60_000).toISOString());
    expect(pinLocked(r.pin_locked_until, t + 14 * 60_000)).toBe(true);
    expect(pinLocked(r.pin_locked_until, t + 16 * 60_000)).toBe(false);
  });
});
