import { describe, expect, it } from 'vitest';
import { generateEventKey, signPass, verifyPass } from '../src/domain/pass';

describe('signed passes', () => {
  it('accepts a pass signed with the event key', async () => {
    const key = await generateEventKey();
    const token = await signPass({ e: 'ev1', g: 'guest-42' }, key);
    expect(await verifyPass(token, key, 'ev1')).toEqual({ ok: true, payload: { e: 'ev1', g: 'guest-42' } });
  });

  it('rejects a pass whose guest id was edited', async () => {
    const key = await generateEventKey();
    const token = await signPass({ e: 'ev1', g: 'guest-42' }, key);
    const [, sig] = token.split('.');
    const forgedBody = btoa(JSON.stringify({ e: 'ev1', g: 'guest-43' })).replace(/=+$/, '');
    expect(await verifyPass(`${forgedBody}.${sig}`, key, 'ev1')).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a pass signed with another key', async () => {
    const token = await signPass({ e: 'ev1', g: 'g' }, await generateEventKey());
    expect(await verifyPass(token, await generateEventKey(), 'ev1')).toMatchObject({ reason: 'bad-signature' });
  });

  it('rejects a valid pass for a different event', async () => {
    const key = await generateEventKey();
    const token = await signPass({ e: 'ev1', g: 'g' }, key);
    expect(await verifyPass(token, key, 'ev2')).toMatchObject({ reason: 'wrong-event' });
  });

  it.each(['', 'nodot', '.', 'a.', 'a.b.c', '%%%.%%%'])('rejects malformed input %j', async (bad) => {
    const result = await verifyPass(bad, await generateEventKey(), 'ev1');
    expect(result.ok).toBe(false);
  });
});
