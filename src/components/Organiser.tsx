import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { mergeLogs, statusFor, type CheckInEvent } from '../domain/checkin';
import { signPass } from '../domain/pass';
import { newId, timeOf } from '../lib/ids';
import type { EventInfo, Guest, Store } from '../lib/store';

const SAMPLE = ['Adaeze Okafor', 'Tunde Bakare', 'Grace Mensah', 'Ifeanyi Obi', 'Zainab Bello', 'Chidi Eze'];

function PassCard({ guest, log }: { guest: Guest; log: CheckInEvent[] }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(guest.token, { margin: 1, width: 160 }).then(setSrc);
  }, [guest.token]);
  const s = statusFor(guest.id, log);
  return (
    <li className="pass">
      {src && <img src={src} alt={`QR pass for ${guest.name}`} width={96} height={96} />}
      <div>
        <strong>{guest.name}</strong>
        <div className={s.checkedIn ? 'tag ok' : 'tag'}>
          {s.checkedIn ? `In at ${timeOf(s.first!.at)} · Door ${s.first!.door}` : 'Not arrived'}
        </div>
        {s.duplicates.length > 0 && <div className="tag warn">{s.duplicates.length} repeat scan(s)</div>}
      </div>
    </li>
  );
}

export function Organiser({ store, event, onChange, tick }: { store: Store; event: EventInfo; onChange: () => void; tick: number }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [log, setLog] = useState<CheckInEvent[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    store.listGuests().then((g) => setGuests(g.sort((a, b) => a.name.localeCompare(b.name))));
    store.serverAll().then((l) => setLog(mergeLogs(l)));
  }, [store, tick]);

  async function add(n: string) {
    const id = newId();
    await store.addGuest({ id, name: n, token: await signPass({ e: event.id, g: id }, event.key) });
  }

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await add(name.trim());
    setName('');
    onChange();
  }

  async function addSample() {
    for (const n of SAMPLE) await add(n);
    onChange();
  }

  const arrived = guests.filter((g) => statusFor(g.id, log).checkedIn).length;

  return (
    <section>
      <p className="lead">
        <strong>{event.name}</strong>: {arrived} of {guests.length} guests checked in (as far as the server knows).
      </p>
      <form onSubmit={addOne} className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" aria-label="Guest name" />
        <button type="submit">Add guest</button>
        {guests.length === 0 && (
          <button type="button" className="secondary" onClick={addSample}>
            Add 6 sample guests
          </button>
        )}
      </form>
      <ul className="passes">
        {guests.map((g) => (
          <PassCard key={g.id} guest={g} log={log} />
        ))}
      </ul>
      {guests.length > 0 && <p className="hint">Scan these QR codes with a door's camera, or pick a guest in the door's test scanner.</p>}
    </section>
  );
}
