import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { identityFromSecretKey } from '../src/core/identity.js';
import { buildSignedDigest, buildSignedMessage, signHeaders } from '../src/core/signing.js';
import { toHex, utf8 } from '../src/core/encoding.js';

interface SigningVector {
  secret: string;
  peerId: string;
  action: string;
  timestamp: string;
  body: string;
  message: string;
  digestHex: string;
  signatureB64: string;
}

const vectorsPath = fileURLToPath(new URL('./vectors/signing.json', import.meta.url));
const vectors: SigningVector[] = existsSync(vectorsPath)
  ? (JSON.parse(readFileSync(vectorsPath, 'utf8')) as SigningVector[])
  : [];

describe('signing', () => {
  it('builds the go-fula message string (empty body hash is the well-known sha256("") base64)', async () => {
    const msg = await buildSignedMessage('blox-free-space', 1756166400, new Uint8Array());
    expect(msg).toBe('blox-free-space:1756166400:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
  });

  it('produces the three headers with a 64-byte Ed25519 signature', async () => {
    const id = await identityFromSecretKey(new Uint8Array(64).map((_, i) => i));
    const h = await signHeaders(id, 'reboot', utf8('{}'), 1756166400);
    expect(h['X-Fula-Peer-ID']).toBe(id.peerIdString);
    expect(h['X-Fula-Timestamp']).toBe('1756166400');
    expect(atob(h['X-Fula-Signature']).length).toBe(64);
  });

  it.skipIf(vectors.length === 0)('matches the go-fula golden signing vectors', async () => {
    for (const v of vectors) {
      const id = await identityFromSecretKey(v.secret);
      expect(id.peerIdString).toBe(v.peerId);
      const body = utf8(v.body);
      expect(await buildSignedMessage(v.action, v.timestamp, body)).toBe(v.message);
      expect(toHex(await buildSignedDigest(v.action, v.timestamp, body))).toBe(v.digestHex);
      const h = await signHeaders(id, v.action, body, Number(v.timestamp));
      expect(h['X-Fula-Signature'], `${v.action} signature`).toBe(v.signatureB64);
    }
  });
});
