import { describe, expect, it } from "vitest";
import { requireAdminPin, requireRosterName } from "@/lib/identity";

describe("School identity rules", () => {
  const rows = [{ full_name: "Abdi Alemu Merga", kind: "student" }, { full_name: "Teacher Name", kind: "teacher" }];
  it("blocks registration if the name is absent from the school student list", () => {
    expect(() => requireRosterName(rows, "Unlisted Student")).toThrow("not in the school list");
  });
  it("accepts the same full name regardless of case and extra spaces", () => {
    expect(requireRosterName(rows, "  ABDI   Alemu Merga ").full_name).toBe("Abdi Alemu Merga");
  });
  it("does not allow teachers to register as students", () => {
    expect(() => requireRosterName(rows, "Teacher Name")).toThrow();
  });
  it("requires the configured PIN for admin access", () => {
    expect(() => requireAdminPin("wrong", "test-pin")).toThrow();
    expect(() => requireAdminPin("test-pin", "test-pin")).not.toThrow();
  });
  it("rejects admin access when the secret is missing", () => {
    expect(() => requireAdminPin("", undefined)).toThrow();
  });
});
import { shouldBlock, subjectsFor } from "@/lib/identity";
describe("exam rules", () => {
  it("blocks only after more than 3 violations", () => {
    expect(shouldBlock(3)).toBe(false);
    expect(shouldBlock(4)).toBe(true);
  });
  it("never includes Civics and adds SAT only when enabled", () => {
    expect(subjectsFor("Natural Science", false)).not.toContain("Civics");
    expect(subjectsFor("Social Science", false)).not.toContain("SAT");
    expect(subjectsFor("Social Science", true)).toContain("SAT");
  });
});
