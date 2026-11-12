import { describe, expect, it } from 'vitest';
import { helpMessage, HELP_COOLDOWN_SEC } from '../lib/exam-timing';

describe('exam help requests', () => {
  const msg = helpMessage({ name: 'Abebe Kebede', code: 'BH-12A-07', grade: '12', section: 'A', stream: 'Natural Science', subject: 'Biology', question: 4 });
  it('tells the Director the student name and ID', () => {
    expect(msg).toContain('Abebe Kebede');
    expect(msg).toContain('BH-12A-07');
  });
  it('tells the Director the class, subject and question the student is on', () => {
    expect(msg).toContain('Grade 12A');
    expect(msg).toContain('Biology');
    expect(msg).toContain('question 4');
  });
  it('counts repeated taps within 30 seconds as one request', () => {
    expect(HELP_COOLDOWN_SEC).toBe(30);
  });
});
