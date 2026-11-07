import { describe, expect, it } from 'vitest';
import { decideScan, mergeLogs, statusFor, type CheckInEvent } from '../src/domain/checkin';

const ev = (id: string, guestId: string, door: string, at: number): CheckInEvent => ({ id, guestId, door, at });

describe('check-in rules', () => {
  it('admits a guest the door has not seen', () => {
    expect(decideScan([], ev('1', 'g1', 'A', 100)).kind).toBe('admitted');
  });

  it('flags a second scan of the same pass and points to the first', () => {
    const first = ev('1', 'g1', 'A', 100);
    const out = decideScan([first], ev('2', 'g1', 'B', 200));
    expect(out).toMatchObject({ kind: 'already-in', first });
  });

  it('earliest check-in wins after two offline doors merge, in either order', () => {
    const doorA = [ev('a1', 'g1', 'A', 300)];
    const doorB = [ev('b1', 'g1', 'B', 250)];
    for (const merged of [mergeLogs(doorA, doorB), mergeLogs(doorB, doorA)]) {
      const s = statusFor('g1', merged);
      expect(s.first?.id).toBe('b1');
      expect(s.duplicates.map((d) => d.id)).toEqual(['a1']);
    }
  });

  it('breaks exact-time ties by event id so every device agrees', () => {
    const merged = mergeLogs([ev('z', 'g1', 'A', 100)], [ev('a', 'g1', 'B', 100)]);
    expect(statusFor('g1', merged).first?.id).toBe('a');
  });

  it('ignores the same event arriving twice', () => {
    const e = ev('1', 'g1', 'A', 100);
    expect(mergeLogs([e], [e], [e])).toHaveLength(1);
  });
});
