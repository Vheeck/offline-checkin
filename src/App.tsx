import { useCallback, useEffect, useMemo, useState } from 'react';
import { Door } from './components/Door';
import { Organiser } from './components/Organiser';
import { generateEventKey } from './domain/pass';
import { IdbStore } from './lib/idbStore';
import { newId } from './lib/ids';
import type { EventInfo } from './lib/store';

const TABS = ['Organiser', 'Door A', 'Door B'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const store = useMemo(() => new IdbStore(), []);
  const [event, setEvent] = useState<EventInfo>();
  const [tab, setTab] = useState<Tab>('Organiser');
  const [tick, setTick] = useState(0);
  // Each door's simulated connection, kept here so it survives switching tabs.
  const [online, setOnline] = useState<Record<string, boolean>>({ A: true, B: true });
  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    (async () => {
      let e = await store.getEvent();
      if (!e) {
        e = { id: newId(), name: 'Demo wedding reception', key: await generateEventKey() };
        await store.saveEvent(e);
      }
      setEvent(e);
    })();
  }, [store, tick]);

  async function reset() {
    await store.reset();
    setEvent(undefined);
    setOnline({ A: true, B: true });
    setTab('Organiser');
    bump();
  }

  return (
    <main>
      <header>
        <h1>Offline check-in</h1>
        <p>Signed QR passes, an append-only check-in log, and doors that keep working with no signal.</p>
      </header>
      <nav role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <button className="tab reset" onClick={reset}>
          Reset demo
        </button>
      </nav>
      {event &&
        (tab === 'Organiser' ? (
          <Organiser store={store} event={event} onChange={bump} tick={tick} />
        ) : (
          <Door
            key={tab}
            store={store}
            event={event}
            door={tab.slice(-1)}
            online={online[tab.slice(-1)]}
            setOnline={(v) => setOnline((o) => ({ ...o, [tab.slice(-1)]: v }))}
            onChange={bump}
            tick={tick}
          />
        ))}
      <footer>
        Demo by <a href="https://github.com/Vheeck">Victor Momoh</a>. Everything runs in your browser; the "server" is simulated in IndexedDB.
      </footer>
    </main>
  );
}
