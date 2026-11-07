/**
 * Signed guest passes.
 *
 * A pass is `<payload>.<signature>`, both base64url. The payload names the event
 * and the guest; the signature is an HMAC-SHA256 over the payload with the
 * event's key. Door devices hold the key, so they can reject forged or edited
 * passes with no network at all.
 */

export interface PassPayload {
  /** Event id */
  e: string;
  /** Guest id */
  g: string;
}

export type VerifyResult =
  | { ok: true; payload: PassPayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'wrong-event' };

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Creates a random event key, exported as base64url so it can be stored. */
export async function generateEventKey(): Promise<string> {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function importKey(eventKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64Url(eventKey), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signPass(payload: PassPayload, eventKey: string): Promise<string> {
  const body = toBase64Url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await importKey(eventKey), enc.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyPass(token: string, eventKey: string, eventId: string): Promise<VerifyResult> {
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts;

  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = fromBase64Url(sig);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify('HMAC', await importKey(eventKey), sigBytes, enc.encode(body));
  if (!valid) return { ok: false, reason: 'bad-signature' };

  let payload: PassPayload;
  try {
    payload = JSON.parse(dec.decode(fromBase64Url(body)));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof payload?.e !== 'string' || typeof payload?.g !== 'string') return { ok: false, reason: 'malformed' };
  if (payload.e !== eventId) return { ok: false, reason: 'wrong-event' };
  return { ok: true, payload };
}
