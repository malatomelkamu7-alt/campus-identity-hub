import { describe, expect, it } from "vitest";
import { uploadSubjects, isPageVisible, teacherStream } from "../lib/admin-rules";
import { visibleRoles } from "../components/Shell";

describe("Mathematics teachers and SAT papers", () => {
  it("lets a Mathematics teacher also send SAT papers", () => {
    expect(uploadSubjects(["Mathematics"])).toEqual(["Mathematics", "SAT"]);
  });
  it("does not give SAT to other subject teachers", () => {
    expect(uploadSubjects(["History"])).toEqual(["History"]);
  });
  it("sends the Social Science Mathematics teacher's SAT papers only to Social Science", () => {
    expect(teacherStream("Social Science", "T-SOC-05")).toBe("Social Science");
  });
});

describe("hidden staff pages", () => {
  const roles = [{ to: "/student" }, { to: "/teacher" }, { to: "/director" }, { to: "/it-admin" }];
  it("removes hidden Director, IT Admin and Teacher pages from the menus", () => {
    expect(visibleRoles(roles, ["director", "it-admin"]).map((r) => r.to)).toEqual(["/student", "/teacher"]);
    expect(isPageVisible("teacher", ["teacher"])).toBe(false);
  });
  it("always keeps the Student page and shows no staff page before the setting is known", () => {
    expect(visibleRoles(roles, ["director", "it-admin", "teacher"]).map((r) => r.to)).toEqual(["/student"]);
    expect(visibleRoles(roles, undefined).map((r) => r.to)).toEqual(["/student"]);
  });
});
