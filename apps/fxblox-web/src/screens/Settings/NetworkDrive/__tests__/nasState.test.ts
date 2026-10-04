import { describe, expect, it } from 'vitest';
import { nasErrorKind, nasErrorRetryable } from '../nasState';

const fulaErr = (code: string, status?: number) =>
  Object.assign(new Error('x'), { name: 'FulaWebError', code, ...(status !== undefined ? { status } : {}) });

describe('nasErrorKind', () => {
  it.each([
    [fulaErr('HTTP_ERROR', 404), 'notProvisioned'],
    [fulaErr('HTTP_ERROR', 400), 'reconnect'],
    [fulaErr('HTTP_ERROR', 503), 'busy'],
    [fulaErr('HTTP_ERROR', 500), 'generic'],
    [fulaErr('DIAL_TIMEOUT'), 'offline'],
    [fulaErr('NO_CANDIDATES'), 'offline'],
    [fulaErr('NOT_INITIALIZED'), 'offline'],
    [fulaErr('BAD_RESPONSE'), 'generic'],
    [new Error('boom'), 'generic'],
    ['nope', 'generic'],
    [null, 'generic'],
  ] as const)('%o → %s', (err, kind) => {
    expect(nasErrorKind(err, {})).toBe(kind);
  });

  it('401: owner-only only when the owner is known and is someone else; otherwise an update is needed', () => {
    const e = fulaErr('NOT_AUTHORIZED', 401);
    expect(nasErrorKind(e, { authorizer: 'owner', appPeerId: 'me' })).toBe('ownerOnly');
    expect(nasErrorKind(e, { authorizer: 'me', appPeerId: 'me' })).toBe('needsUpdate');
    expect(nasErrorKind(e, { authorizer: undefined, appPeerId: 'me' })).toBe('needsUpdate');
    expect(nasErrorKind(e, { authorizer: 'owner', appPeerId: undefined })).toBe('needsUpdate');
  });

  it('every kind but owner-only offers a retry', () => {
    expect(nasErrorRetryable('ownerOnly')).toBe(false);
    for (const k of ['notProvisioned', 'needsUpdate', 'reconnect', 'busy', 'offline', 'generic'] as const) {
      expect(nasErrorRetryable(k)).toBe(true);
    }
  });
});
