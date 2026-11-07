/**
 * Check-in rules, kept free of storage and UI so they are easy to test.
 *
 * Every scan is recorded as an append-only CheckInEvent. A guest's status is
 * derived from the log, never stored: the earliest accepted check-in wins, and
 * any later scan of the same pass is a duplicate. Because the rule only depends
 * on the set of events, two doors that were offline can merge their logs in any
 * order and agree on the result.
 */

export interface CheckInEvent {
  /** Unique per scan (UUID), so syncing the same event twice is harmless. */
  id: string;
  guestId: string;
  door: string;
  /** Epoch milliseconds on the scanning device. */
  at: number;
}

export interface GuestStatus {
  guestId: string;
  checkedIn: boolean;
  /** The check-in that counts (earliest). */
  first?: CheckInEvent;
  /** Every later scan of the same pass. */
  duplicates: CheckInEvent[];
}

/** Total order used everywhere: time first, then id as a tie-breaker. */
export function compareEvents(a: CheckInEvent, b: CheckInEvent): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Merges logs from any number of devices, dropping repeats of the same event id. */
export function mergeLogs(...logs: CheckInEvent[][]): CheckInEvent[] {
  const byId = new Map<string, CheckInEvent>();
  for (const log of logs) for (const ev of log) if (!byId.has(ev.id)) byId.set(ev.id, ev);
  return [...byId.values()].sort(compareEvents);
}

export function statusFor(guestId: string, log: CheckInEvent[]): GuestStatus {
  const mine = log.filter((e) => e.guestId === guestId).sort(compareEvents);
  return { guestId, checkedIn: mine.length > 0, first: mine[0], duplicates: mine.slice(1) };
}

export type ScanOutcome =
  | { kind: 'admitted'; event: CheckInEvent }
  | { kind: 'already-in'; event: CheckInEvent; first: CheckInEvent };

/**
 * Decides what the door shows for a valid pass, given what this device knows.
 * The scan is always recorded, so a duplicate is visible later to organisers.
 */
export function decideScan(log: CheckInEvent[], event: CheckInEvent): ScanOutcome {
  const { first } = statusFor(event.guestId, log);
  return first ? { kind: 'already-in', event, first } : { kind: 'admitted', event };
}
