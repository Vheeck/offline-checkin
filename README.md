# Offline check-in

**Live demo: https://vheeck.github.io/offline-checkin/**

A small, complete example of door check-in that keeps working when the venue has no signal: signed QR passes, an append-only check-in log, and a sync queue that merges scans from several doors without conflicts.

I built this to show the approach behind [Lobby](https://lobby.devatom.tech), the event guest platform I run at Devatom. It's written from scratch for this repo and shares no code with Lobby.

## Try it

1. **Organiser:** add the sample guests. Each one gets a signed QR pass.
2. **Door A:** switch it offline and admit a guest.
3. **Door B:** switch it offline and admit the *same* guest. Both doors let them in; neither can know about the other.
4. Bring both doors back online. They sync, agree that the earlier scan counts, and the organiser sees one arrival and one repeat scan.
5. Try **Forged pass**: a real signature on an edited guest id. The door rejects it without any network.

Use a phone camera on the Door tab to scan the QR codes for real, or the test scanner on a laptop.

## How it works

```
Organiser ── signs passes (HMAC-SHA256, event key) ──► QR codes
                                                          │
Door device ── verifies signature offline ──► records scan (append-only, IndexedDB)
     │                                                    │
     └──── when online: push unsynced scans, pull everyone else's ◄──► server
```

| Concern | Decision |
| --- | --- |
| Forged or edited passes | Passes are `payload.signature`. Doors hold the event key and verify with Web Crypto, so no lookup is needed at the door. |
| No signal at the door | Every scan is written to IndexedDB first. A service worker caches the app shell, so the page also loads offline. |
| Two doors admit the same guest offline | Scans are events, never updates. Status is derived: the earliest scan (ties broken by id) wins, and later ones are repeat scans. Any merge order gives the same answer. |
| Retries and flaky networks | Each scan has a UUID. The server ignores ids it has seen, so sync is safe to repeat. |
| Auditability | Repeat and rejected-duplicate scans are kept, so organisers can see a pass being shared. |

**Trade-offs:** a door device holds the event key, so a stolen, unlocked door phone could mint passes for that one event. In production, scope the key to a single event, issue it only to signed-in door staff, and rotate it if a device is lost. A real backend replaces the simulated server here (`serverPut` / `serverAll` in `src/lib/store.ts`).

## Code map

| Path | What |
| --- | --- |
| `src/domain/pass.ts` | Signing and verifying passes |
| `src/domain/checkin.ts` | Check-in rules: merge, status, scan decision (pure functions) |
| `src/lib/idbStore.ts` | IndexedDB storage; scans are written with `add()`, never overwritten |
| `src/lib/sync.ts` | Push/pull sync, idempotent |
| `public/sw.js` | Service worker for offline loading |
| `tests/` | Vitest: forged passes, merge order, ties, idempotent sync, against both in-memory and IndexedDB stores |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 21 tests
npm run build
```

Stack: React 19, TypeScript, Vite, Vitest, Web Crypto, IndexedDB, `qr-scanner`, `qrcode`. CI runs type checks, tests and the build on every push, then deploys to GitHub Pages.

---

Victor Momoh · [LinkedIn](https://linkedin.com/in/victor-momoh-29a920172) · [devatom.tech](https://devatom.tech)
