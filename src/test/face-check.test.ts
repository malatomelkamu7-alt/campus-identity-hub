import { describe, expect, it } from "vitest";
import { parseJson, uncoveredVerdict, isDuplicate, COVERED_MSG, NO_FACE_MSG, UNCLEAR_MSG } from "@/lib/face.server";

describe("face verification rules", () => {
  it("passes one clear, uncovered face", () => {
    expect(uncoveredVerdict({ face_count: 1, clear: true, fully_uncovered: true })).toBeNull();
  });
  it("accepts string answers from the model", () => {
    expect(uncoveredVerdict({ face_count: "1", clear: "true", fully_uncovered: "true" })).toBeNull();
  });
  it("rejects a covered face", () => {
    expect(uncoveredVerdict({ face_count: 1, clear: true, fully_uncovered: false })).toBe(COVERED_MSG);
  });
  it("rejects zero or two faces", () => {
    expect(uncoveredVerdict({ face_count: 0, fully_uncovered: true })).toBe(NO_FACE_MSG);
    expect(uncoveredVerdict({ face_count: 2, fully_uncovered: true })).toBe(NO_FACE_MSG);
  });
  it("asks for a retake when the photo is too dark or blurry", () => {
    expect(uncoveredVerdict({ face_count: 1, clear: false, fully_uncovered: true })).toBe(UNCLEAR_MSG);
  });
  it("reads JSON wrapped in code fences", () => {
    expect(parseJson('```json\n{"face_count": 1}\n```')).toEqual({ face_count: 1 });
  });
  it("flags a duplicate only for a confident match inside the batch", () => {
    expect(isDuplicate({ match_index: 2, confidence: 0.9 }, 3)).toBe(true);
    expect(isDuplicate({ match_index: 2, confidence: 0.5 }, 3)).toBe(false);
    expect(isDuplicate({ match_index: null, confidence: 0 }, 3)).toBe(false);
    expect(isDuplicate({ match_index: 0, confidence: 1 }, 3)).toBe(false);
    expect(isDuplicate({ match_index: 5, confidence: 1 }, 3)).toBe(false);
  });
});
