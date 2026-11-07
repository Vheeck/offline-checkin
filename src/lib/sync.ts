import { mergeLogs, type CheckInEvent } from '../domain/checkin';
import type { Store } from './store';

export interface SyncResult {
  pushed: number;
  pulled: number;
}

const strip = ({ id, guestId, door, at }: CheckInEvent): CheckInEvent => ({ id, guestId, door, at });

/**
 * Pushes this door's unsynced scans, then pulls everything the server has.
 * Safe to run any number of times: the server ignores event ids it has seen,
 * and the door only adds events it doesn't know yet.
 */
export async function syncDoor(store: Store, door: string): Promise<SyncResult> {
  const log = await store.doorLog(door);
  const pending = log.filter((r) => !r.synced).map(strip);
  if (pending.length) {
    await store.serverPut(pending);
    await store.markSynced(
      door,
      pending.map((e) => e.id),
    );
  }

  const known = new Set(log.map((r) => r.id));
  const remote = await store.serverAll();
  const fresh = remote.filter((e) => !known.has(e.id));
  if (fresh.length) await store.learn(door, fresh);
  return { pushed: pending.length, pulled: fresh.length };
}

/** The door's view of the world, in the order the rules expect. */
export async function knownLog(store: Store, door: string): Promise<CheckInEvent[]> {
  return mergeLogs((await store.doorLog(door)).map(strip));
}
