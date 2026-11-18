import { describe, expect, it } from "vitest";
import { canTakeQuiz, quizScore, quizShouldBlock } from "../lib/quiz-rules";

describe("class quizzes", () => {
  const quiz = { stream: "Natural Science", sections: ["12A"] };
  it("lets only the chosen section take the quiz", () => {
    expect(canTakeQuiz({ grade: "12", section: "A", stream: "Natural Science" }, quiz)).toBe(true);
    expect(canTakeQuiz({ grade: "12", section: "B", stream: "Natural Science" }, quiz)).toBe(false);
  });
  it("allows 2 fullscreen warnings and blocks on the 3rd exit", () => {
    expect(quizShouldBlock(2)).toBe(false);
    expect(quizShouldBlock(3)).toBe(true);
  });
  it("adds the marks of correct answers", () => {
    const qs = [{ id: "a", answer: 1, marks: 2 }, { id: "b", answer: 0, marks: 1 }];
    expect(quizScore(qs, { a: 1, b: 3 })).toEqual({ score: 2, total: 3 });
  });
});
