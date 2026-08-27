/**
 * The `@/lib/fula` shim: lazy namespaces over a package that may not export everything yet. Missing methods
 * reject with a clear error instead of a TypeError deep in a store; present ones pass through.
 */
import { describe, expect, test, vi } from 'vitest';

vi.mock('@functionland/fula-web-client', () => ({
  identity: { peerIdFromSecretKey: vi.fn(async () => '12D3KooWFromPackage') },
  FulaWebError: class FulaWebError extends Error {},
}));

import { fula, blockchain, fxblox, identity, configure, isFulaClientAvailable, isFulaWebError } from '@/lib/fula';

describe('lib/fula shim', () => {
  test('reports the client as unavailable when the package lacks the fula namespace', async () => {
    expect(await isFulaClientAvailable()).toBe(false);
  });

  test('missing namespaces reject with a descriptive error (never a TypeError)', async () => {
    await expect(fula.isReady(false)).rejects.toThrow(/does not export "fula.isReady" yet/);
    await expect(blockchain.bloxFreeSpace()).rejects.toThrow(/blockchain.bloxFreeSpace/);
    await expect(fxblox.listActivePlugins()).rejects.toThrow(/fxblox.listActivePlugins/);
  });

  test('present namespaces are passed through (loaded lazily on first call)', async () => {
    expect(await identity.peerIdFromSecretKey('1,2,3')).toBe('12D3KooWFromPackage');
  });

  test('the proxies are not thenables (safe to return from async functions)', async () => {
    const value = await Promise.resolve(fula);
    expect(value).toBe(fula);
  });

  test('configure() warns instead of throwing when absent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(configure({ discoveryUrl: 'https://x' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('isFulaWebError duck-types the lazy-chunk error class', () => {
    expect(isFulaWebError(Object.assign(new Error('x'), { name: 'FulaWebError', code: 'NOT_AUTHORIZED' }))).toBe(true);
    expect(isFulaWebError(new Error('x'))).toBe(false);
  });
});
