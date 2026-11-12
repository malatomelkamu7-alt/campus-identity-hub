import { describe, expect, it } from "vitest";
import { canReplaceFace, canTakeStream, teacherStream, teacherRowSchema } from "../lib/admin-rules";
describe("admin identity and exam rules", () => {
  it("allows photo replacement only after admin revokes verification", () => {
    expect(canReplaceFace({ face_verified: true })).toBe(false);
    expect(canReplaceFace({ face_verified: false })).toBe(true);
  });
  it("keeps Natural and Social exams separate even for English", () => {
    expect(canTakeStream("Natural Science", "Social Science")).toBe(false);
    expect(canTakeStream("Social Science", "Natural Science")).toBe(false);
    expect(canTakeStream("Natural Science", "Natural Science")).toBe(true);
    expect(canTakeStream("Social Science", "Social Science")).toBe(true);
  });
  it("classifies existing shared-subject teachers by their school stream ID", () => {
    expect(teacherStream("Both", "T-SOC-04")).toBe("Social Science");
    expect(teacherStream("Both", "T-NAT-05")).toBe("Natural Science");
  });
  it("requires subjects for manually entered and uploaded teachers", () => {
    expect(teacherRowSchema.safeParse({ full_name: "New Teacher", stream: "Natural Science", gender: "M", subjects: [] }).success).toBe(false);
    expect(teacherRowSchema.safeParse({ full_name: "New Teacher", stream: "Natural Science", gender: "M", subjects: ["Physics"] }).success).toBe(true);
  });
});
import { isValidResultPin, hashResultPin } from "@/lib/admin-rules";
describe("student result passcode", () => {
  it("accepts only 4 to 6 numbers", () => {
    expect(isValidResultPin("1234")).toBe(true);
    expect(isValidResultPin("123456")).toBe(true);
    expect(isValidResultPin("123")).toBe(false);
    expect(isValidResultPin("1234567")).toBe(false);
    expect(isValidResultPin("12a4")).toBe(false);
  });
  it("only the same passcode unlocks the same student's results", async () => {
    const h = await hashResultPin("BH-12A-01", "4821");
    expect(await hashResultPin("bh-12a-01", "4821")).toBe(h);
    expect(await hashResultPin("BH-12A-01", "4822")).not.toBe(h);
    expect(await hashResultPin("BH-12A-02", "4821")).not.toBe(h);
  });
});
