import { describe, expect, it } from 'vitest';
import { canStartExam, personalDeadline, remainingSeconds } from '../lib/exam-timing';

describe('individual exam timing', () => {
  it('gives students starting ten minutes apart the same full duration', () => {
    expect(personalDeadline('2026-10-25T06:00:00Z', 3600)).toBe('2026-10-25T07:00:00.000Z');
    expect(personalDeadline('2026-10-25T06:10:00Z', 3600)).toBe('2026-10-25T07:10:00.000Z');
  });
  it('adds the Director extra minutes to a personal duration', () => {
    expect(personalDeadline('2026-10-25T06:00:00Z', 3600, 600)).toBe('2026-10-25T07:10:00.000Z');
  });
  it('only permits starts inside the scheduled window and when open', () => {
    const start = '2026-10-25T06:00:00Z', close = '2026-10-25T08:00:00Z';
    expect(canStartExam(true, start, close, Date.parse(start))).toBe(true);
    expect(canStartExam(true, start, close, Date.parse(start)-1)).toBe(false);
    expect(canStartExam(true, start, close, Date.parse(close))).toBe(false);
    expect(canStartExam(false, start, close, Date.parse(start))).toBe(false);
  });
  it('never resets an expired personal countdown', () => {
    expect(remainingSeconds('2026-10-25T07:00:00Z', Date.parse('2026-10-25T07:01:00Z'))).toBe(0);
  });
});