import type { CheckInEvent } from '../domain/checkin';

export interface EventInfo {
  id: string;
  name: string;
  /** HMAC key for passes (base64url). Lives on organiser and door devices only. */
  key: string;
}

export interface Guest {
  id: string;
  name: string;
  /** Signed pass, encoded in the guest's QR code. */
  token: string;
}

/** An event as one door device knows it. */
export interface DoorRecord extends CheckInEvent {
  knownBy: string;
  synced: boolean;
}

/**
 * Everything the app persists. Two implementations: IndexedDB in the browser,
 * and an in-memory one for tests. The "server" methods stand in for a backend
 * API so the demo runs as a static site.
 */
export interface Store {
  getEvent(): Promise<EventInfo | undefined>;
  saveEvent(e: EventInfo): Promise<void>;
  listGuests(): Promise<Guest[]>;
  addGuest(g: Guest): Promise<void>;

  /** Everything this door knows: its own scans plus events pulled from the server. */
  doorLog(door: string): Promise<DoorRecord[]>;
  /** Appends a scan made at this door. Never updates or deletes. */
  recordScan(door: string, ev: CheckInEvent): Promise<void>;
  markSynced(door: string, ids: string[]): Promise<void>;
  /** Adds events learned from the server (already synced by definition). */
  learn(door: string, evs: CheckInEvent[]): Promise<void>;

  serverPut(evs: CheckInEvent[]): Promise<void>;
  serverAll(): Promise<CheckInEvent[]>;

  reset(): Promise<void>;
}

export class MemoryStore implements Store {
  private event?: EventInfo;
  private guests = new Map<string, Guest>();
  private door = new Map<string, DoorRecord>();
  private server = new Map<string, CheckInEvent>();

  async getEvent() {
    return this.event;
  }
  async saveEvent(e: EventInfo) {
    this.event = e;
  }
  async listGuests() {
    return [...this.guests.values()];
  }
  async addGuest(g: Guest) {
    this.guests.set(g.id, g);
  }
  async doorLog(door: string) {
    return [...this.door.values()].filter((r) => r.knownBy === door);
  }
  async recordScan(door: string, ev: CheckInEvent) {
    const k = `${door}|${ev.id}`;
    if (!this.door.has(k)) this.door.set(k, { ...ev, knownBy: door, synced: false });
  }
  async markSynced(door: string, ids: string[]) {
    for (const id of ids) {
      const r = this.door.get(`${door}|${id}`);
      if (r) r.synced = true;
    }
  }
  async learn(door: string, evs: CheckInEvent[]) {
    for (const ev of evs) {
      const k = `${door}|${ev.id}`;
      if (!this.door.has(k)) this.door.set(k, { ...ev, knownBy: door, synced: true });
    }
  }
  async serverPut(evs: CheckInEvent[]) {
    for (const ev of evs) if (!this.server.has(ev.id)) this.server.set(ev.id, ev);
  }
  async serverAll() {
    return [...this.server.values()];
  }
  async reset() {
    this.event = undefined;
    this.guests.clear();
    this.door.clear();
    this.server.clear();
  }
}
