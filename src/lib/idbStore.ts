import type { CheckInEvent } from '../domain/checkin';
import type { DoorRecord, EventInfo, Guest, Store } from './store';

const DB_NAME = 'offline-checkin';
const VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function open(): Promise<IDBDatabase> {
  const r = indexedDB.open(DB_NAME, VERSION);
  r.onupgradeneeded = () => {
    const db = r.result;
    db.createObjectStore('meta');
    db.createObjectStore('guests', { keyPath: 'id' });
    const door = db.createObjectStore('door', { keyPath: ['knownBy', 'id'] });
    door.createIndex('byDoor', 'knownBy');
    db.createObjectStore('server', { keyPath: 'id' });
  };
  return req(r);
}

/** IndexedDB-backed store. Check-ins are written with add(), so they can't be overwritten. */
export class IdbStore implements Store {
  private db = open();

  private async tx(stores: string[], mode: IDBTransactionMode) {
    return (await this.db).transaction(stores, mode);
  }

  async getEvent() {
    const t = await this.tx(['meta'], 'readonly');
    return req<EventInfo | undefined>(t.objectStore('meta').get('event'));
  }
  async saveEvent(e: EventInfo) {
    const t = await this.tx(['meta'], 'readwrite');
    t.objectStore('meta').put(e, 'event');
    await done(t);
  }
  async listGuests() {
    const t = await this.tx(['guests'], 'readonly');
    return req<Guest[]>(t.objectStore('guests').getAll());
  }
  async addGuest(g: Guest) {
    const t = await this.tx(['guests'], 'readwrite');
    t.objectStore('guests').put(g);
    await done(t);
  }
  async doorLog(door: string) {
    const t = await this.tx(['door'], 'readonly');
    return req<DoorRecord[]>(t.objectStore('door').index('byDoor').getAll(door));
  }
  private async addIfMissing(door: string, evs: CheckInEvent[], synced: boolean) {
    const t = await this.tx(['door'], 'readwrite');
    const s = t.objectStore('door');
    for (const ev of evs) {
      const existing = await req(s.getKey([door, ev.id]));
      if (existing === undefined) s.add({ ...ev, knownBy: door, synced });
    }
    await done(t);
  }
  async recordScan(door: string, ev: CheckInEvent) {
    await this.addIfMissing(door, [ev], false);
  }
  async learn(door: string, evs: CheckInEvent[]) {
    await this.addIfMissing(door, evs, true);
  }
  async markSynced(door: string, ids: string[]) {
    const t = await this.tx(['door'], 'readwrite');
    const s = t.objectStore('door');
    for (const id of ids) {
      const r = await req<DoorRecord | undefined>(s.get([door, id]));
      // Only the sync flag changes; the scan itself is never edited.
      if (r && !r.synced) s.put({ ...r, synced: true });
    }
    await done(t);
  }
  async serverPut(evs: CheckInEvent[]) {
    const t = await this.tx(['server'], 'readwrite');
    const s = t.objectStore('server');
    for (const ev of evs) {
      const existing = await req(s.getKey(ev.id));
      if (existing === undefined) s.add(ev);
    }
    await done(t);
  }
  async serverAll() {
    const t = await this.tx(['server'], 'readonly');
    return req<CheckInEvent[]>(t.objectStore('server').getAll());
  }
  async reset() {
    const t = await this.tx(['meta', 'guests', 'door', 'server'], 'readwrite');
    for (const n of ['meta', 'guests', 'door', 'server']) t.objectStore(n).clear();
    await done(t);
  }
}
