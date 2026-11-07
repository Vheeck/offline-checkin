import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { statusFor, type CheckInEvent } from '../src/domain/checkin';
import { IdbStore } from '../src/lib/idbStore';
import { MemoryStore, type Store } from '../src/lib/store';
import { knownLog, syncDoor } from '../src/lib/sync';

const ev = (id: string, guestId: string, door: string, at: number): CheckInEvent => ({ id, guestId, door, at });

describe.each([
  ['memory', () => new MemoryStore()],
  ['indexeddb', () => new IdbStore()],
] as [string, () => Store][])('sync (%s store)', (_name, make) => {
  it('two doors scan the same guest offline, then converge after syncing', async () => {
    const store = make();
    await store.reset();
    await store.recordScan('A', ev('a1', 'g1', 'A', 300));
    await store.recordScan('B', ev('b1', 'g1', 'B', 250));

    // Offline, each door believes its own scan admitted the guest.
    expect(statusFor('g1', await knownLog(store, 'A')).first?.id).toBe('a1');
    expect(statusFor('g1', await knownLog(store, 'B')).first?.id).toBe('b1');

    await syncDoor(store, 'A');
    await syncDoor(store, 'B');
    await syncDoor(store, 'A');

    for (const door of ['A', 'B']) {
      const s = statusFor('g1', await knownLog(store, door));
      expect(s.first?.id).toBe('b1');
      expect(s.duplicates.map((d) => d.id)).toEqual(['a1']);
    }
  });

  it('is idempotent: repeated syncs push nothing new', async () => {
    const store = make();
    await store.reset();
    await store.recordScan('A', ev('x', 'g2', 'A', 10));
    expect(await syncDoor(store, 'A')).toEqual({ pushed: 1, pulled: 0 });
    expect(await syncDoor(store, 'A')).toEqual({ pushed: 0, pulled: 0 });
    expect(await store.serverAll()).toHaveLength(1);
  });

  it('never overwrites a recorded scan', async () => {
    const store = make();
    await store.reset();
    await store.recordScan('A', ev('x', 'g2', 'A', 10));
    await store.recordScan('A', ev('x', 'g-other', 'A', 999));
    const log = await store.doorLog('A');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ guestId: 'g2', at: 10 });
  });
});
