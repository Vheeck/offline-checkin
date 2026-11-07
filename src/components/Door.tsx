import { useCallback, useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { decideScan, statusFor, type CheckInEvent } from '../domain/checkin';
import { verifyPass } from '../domain/pass';
import { newId, timeOf } from '../lib/ids';
import type { EventInfo, Guest, Store } from '../lib/store';
import { knownLog, syncDoor } from '../lib/sync';

type Banner =
  | { tone: 'ok'; title: string; detail: string }
  | { tone: 'warn'; title: string; detail: string }
  | { tone: 'bad'; title: string; detail: string };

/** A gatecrasher's attempt: someone else's signature on an edited guest id. */
const forge = (token: string, eventId: string) =>
  token.replace(/^[^.]+/, btoa(JSON.stringify({ e: eventId, g: 'gatecrasher' })).replace(/=+$/, ''));

const REASONS = {
  malformed: 'This is not a pass for this system.',
  'bad-signature': 'The pass has been altered or forged.',
  'wrong-event': 'This pass is for a different event.',
};

interface Props {
  store: Store;
  event: EventInfo;
  door: string;
  online: boolean;
  setOnline: (v: boolean) => void;
  onChange: () => void;
  tick: number;
}

export function Door({ store, event, door, online, setOnline, onChange, tick }: Props) {
  const [pending, setPending] = useState(0);
  const [known, setKnown] = useState<CheckInEvent[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [banner, setBanner] = useState<Banner>();
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    const log = await store.doorLog(door);
    setPending(log.filter((r) => !r.synced).length);
    setKnown(await knownLog(store, door));
    setGuests(await store.listGuests());
  }, [store, door]);

  useEffect(() => {
    refresh();
  }, [refresh, tick]);

  const sync = useCallback(async () => {
    if (!online) return;
    const r = await syncDoor(store, door);
    if (r.pushed || r.pulled) onChange();
    await refresh();
  }, [online, store, door, onChange, refresh]);

  // Background sync whenever this door is online.
  useEffect(() => {
    if (!online) return;
    sync();
    const t = setInterval(sync, 4000);
    return () => clearInterval(t);
  }, [online, sync]);

  const handleToken = useCallback(
    async (token: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const v = await verifyPass(token, event.key, event.id);
        if (!v.ok) {
          setBanner({ tone: 'bad', title: 'Invalid pass', detail: REASONS[v.reason] });
          return;
        }
        const scan: CheckInEvent = { id: newId(), guestId: v.payload.g, door, at: Date.now() };
        const log = await knownLog(store, door);
        const outcome = decideScan(log, scan);
        await store.recordScan(door, scan); // recorded either way: repeats are evidence too
        const guest = (await store.listGuests()).find((g) => g.id === v.payload.g);
        const who = guest?.name ?? 'Guest';
        setBanner(
          outcome.kind === 'admitted'
            ? { tone: 'ok', title: `Welcome, ${who}`, detail: `Checked in at ${timeOf(scan.at)}${online ? '' : ' (saved offline)'}` }
            : {
                tone: 'warn',
                title: `${who} is already in`,
                detail: `First checked in at ${timeOf(outcome.first.at)} at Door ${outcome.first.door}. Check ID before admitting.`,
              },
        );
        await refresh();
        if (online) sync();
      } finally {
        setTimeout(() => (busy.current = false), 1200);
      }
    },
    [event, door, store, online, refresh, sync],
  );

  useEffect(() => {
    if (!camera || !video.current) return;
    const scanner = new QrScanner(video.current, (r) => handleToken(r.data), { highlightScanRegion: true, maxScansPerSecond: 4 });
    scanner.start().catch(() => {
      setBanner({ tone: 'bad', title: 'Camera unavailable', detail: 'Allow camera access, or use the test scanner below.' });
      setCamera(false);
    });
    return () => scanner.destroy();
  }, [camera, handleToken]);

  const inCount = guests.filter((g) => statusFor(g.id, known).checkedIn).length;

  return (
    <section>
      <div className="row between">
        <label className="switch">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          <span>{online ? 'Online' : 'Offline (simulated)'}</span>
        </label>
        <span className={pending ? 'tag warn' : 'tag ok'}>{pending ? `${pending} scan(s) waiting to sync` : 'All scans synced'}</span>
      </div>

      {banner && (
        <div className={`banner ${banner.tone}`} role="status">
          <strong>{banner.title}</strong>
          <span>{banner.detail}</span>
        </div>
      )}

      <div className="row">
        <button onClick={() => setCamera((c) => !c)}>{camera ? 'Stop camera' : 'Scan with camera'}</button>
      </div>
      {camera && <video ref={video} className="video" muted playsInline />}

      <details open>
        <summary>Test scanner (no camera needed)</summary>
        <div className="chips">
          {guests.map((g) => (
            <button key={g.id} className="chip" onClick={() => handleToken(g.token)}>
              {g.name}
            </button>
          ))}
          <button className="chip bad" onClick={() => handleToken(forge(guests[0]?.token ?? 'x.y', event.id))}>
            Forged pass
          </button>
        </div>
      </details>

      <p className="hint">
        This door knows of {inCount} of {guests.length} guests checked in. Turn it offline, scan, then come back online to watch the queue drain.
      </p>
    </section>
  );
}
