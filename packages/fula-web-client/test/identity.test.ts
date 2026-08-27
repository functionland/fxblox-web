import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { identityFromSecretKey, identityStringFromSecretKey, privateKeyProtobuf } from '../src/core/identity.js';
import { toBase64Std, toHex } from '../src/core/encoding.js';

interface IdentityVector {
  secret: string;
  seedHex: string;
  privKeyProtobufB64: string;
  pubKeyRawHex: string;
  peerId: string;
}

const vectorsPath = fileURLToPath(new URL('./vectors/identity.json', import.meta.url));
const vectors: IdentityVector[] = existsSync(vectorsPath)
  ? (JSON.parse(readFileSync(vectorsPath, 'utf8')) as IdentityVector[])
  : [];

describe('identityStringFromSecretKey', () => {
  it('joins bytes with commas exactly like Uint8Array.prototype.toString()', () => {
    const sk = new Uint8Array(64).map((_, i) => i);
    expect(identityStringFromSecretKey(sk)).toBe(sk.toString());
    expect(identityStringFromSecretKey(sk)).toMatch(/^\d+(,\d+){63}$/);
  });

  it('passes a string through unchanged', () => {
    expect(identityStringFromSecretKey('1,2,3')).toBe('1,2,3');
  });
});

describe('identityFromSecretKey', () => {
  it('is deterministic and yields an Ed25519 12D3KooW peer id', async () => {
    const sk = new Uint8Array(64).map((_, i) => 255 - i);
    const a = await identityFromSecretKey(sk);
    const b = await identityFromSecretKey(sk.toString());
    expect(a.peerIdString).toBe(b.peerIdString);
    expect(a.peerIdString.startsWith('12D3KooW')).toBe(true);
    expect(a.seed.length).toBe(32);
    expect(a.privateKey.raw.length).toBe(64);
  });

  it.skipIf(vectors.length === 0)('matches the go-fula golden vectors', async () => {
    for (const v of vectors) {
      const id = await identityFromSecretKey(v.secret);
      expect(toHex(id.seed), `seed for ${v.secret.slice(0, 16)}…`).toBe(v.seedHex);
      expect(id.peerIdString, `peerId for ${v.secret.slice(0, 16)}…`).toBe(v.peerId);
      expect(toHex(id.privateKey.publicKey.raw)).toBe(v.pubKeyRawHex);
      expect(toBase64Std(privateKeyProtobuf(id))).toBe(v.privKeyProtobufB64);
    }
  });
});
