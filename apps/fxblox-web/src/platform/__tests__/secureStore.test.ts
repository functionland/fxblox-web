/**
 * SecureStore — real WebCrypto + fake IndexedDB (no mocks).
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Service, aadFor, load, reset, save, wipe, listServices, _internal, ensurePersistentStorage } from '../secureStore';

beforeEach(async () => {
  await wipe();
});

describe('secureStore', () => {
  test('save returns the keychain-shaped credentials and load round-trips them', async () => {
    const saved = await save('DIDPassword', 'hunter2', Service.DIDPassword);
    expect(saved).toEqual(expect.objectContaining({ username: 'DIDPassword', password: 'hunter2', service: Service.DIDPassword }));
    const loaded = await load(Service.DIDPassword);
    expect(loaded).not.toBe(false);
    expect((loaded as { password: string }).password).toBe('hunter2');
    expect((loaded as { username: string }).username).toBe('DIDPassword');
  });

  test('load returns false when nothing is stored (keychain "no credentials")', async () => {
    expect(await load(Service.Signiture)).toBe(false);
  });

  test('ciphertext at rest is not the plaintext, and the master key is non-extractable', async () => {
    await save('Signiture', '0xdeadbeef', Service.Signiture);
    const record = await _internal.withStore<{ ct: ArrayBuffer; iv: Uint8Array; v: number; service: string }>(_internal.SECRETS_STORE, 'readonly', (s) => s.get(Service.Signiture));
    expect(record.v).toBe(1);
    expect(record.service).toBe(Service.Signiture);
    expect(record.iv.byteLength).toBe(12);
    expect(new TextDecoder().decode(record.ct)).not.toContain('deadbeef');
    const key = await _internal.getMasterKey();
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toEqual(expect.objectContaining({ name: 'AES-GCM', length: 256 }));
  });

  test('AAD binds a ciphertext to its service slot: a record moved to another key does not decrypt', async () => {
    await save('Address', '0xabc', Service.Address);
    const record = await _internal.withStore<unknown>(_internal.SECRETS_STORE, 'readonly', (s) => s.get(Service.Address));
    // Copy the record verbatim under the FULAPeerId slot (an attacker or a bug swapping slots).
    await _internal.withStore(_internal.SECRETS_STORE, 'readwrite', (s) => s.put({ ...(record as object), service: Service.FULAPeerId }, Service.FULAPeerId));
    expect(await load(Service.FULAPeerId)).toBe(false);
    expect((await load(Service.Address)) as { password: string }).toEqual(expect.objectContaining({ password: '0xabc' }));
    expect(aadFor('A')).not.toEqual(aadFor('B'));
  });

  test('overwriting a slot keeps createdAt and bumps updatedAt', async () => {
    await save('u', 'one', Service.FULARootCID);
    const first = await _internal.withStore<{ createdAt: number; updatedAt: number }>(_internal.SECRETS_STORE, 'readonly', (s) => s.get(Service.FULARootCID));
    await new Promise((r) => setTimeout(r, 5));
    await save('u', 'two', Service.FULARootCID);
    const second = await _internal.withStore<{ createdAt: number; updatedAt: number }>(_internal.SECRETS_STORE, 'readonly', (s) => s.get(Service.FULARootCID));
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    expect((await load(Service.FULARootCID)) as { password: string }).toEqual(expect.objectContaining({ password: 'two' }));
  });

  test('reset removes one slot only', async () => {
    await save('a', '1', Service.DIDPassword);
    await save('b', '2', Service.Signiture);
    expect(await reset(Service.DIDPassword)).toBe(true);
    expect(await load(Service.DIDPassword)).toBe(false);
    expect((await load(Service.Signiture)) as { password: string }).toEqual(expect.objectContaining({ password: '2' }));
    expect(await listServices()).toEqual([Service.Signiture]);
  });

  test('wipe clears every secret and the master key; the store is usable again afterwards', async () => {
    await save('a', '1', Service.DIDPassword);
    const keyBefore = await _internal.getMasterKey();
    await wipe();
    expect(await load(Service.DIDPassword)).toBe(false);
    await save('a', '3', Service.DIDPassword);
    const keyAfter = await _internal.getMasterKey();
    expect(keyAfter).not.toBe(keyBefore);
    expect((await load(Service.DIDPassword)) as { password: string }).toEqual(expect.objectContaining({ password: '3' }));
  });

  test('a rejected IDB request surfaces as a rejection of the call, not an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await save('a', '1', Service.DIDPassword);
      // `add` on an existing key → ConstraintError from the request; withStore must reject cleanly.
      await expect(_internal.withStore(_internal.SECRETS_STORE, 'readwrite', (s) => s.add({ v: 1 }, Service.DIDPassword))).rejects.toBeDefined();
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  test('ensurePersistentStorage never throws', async () => {
    await expect(ensurePersistentStorage()).resolves.toBeTypeOf('boolean');
  });
});
