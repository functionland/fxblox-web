import { describe, expect, test } from 'vitest';
import { peerIdToBytes32, bytes32ToPeerId } from '../peerIdConversion';

// The production relay's Ed25519 peer id (a real CIDv1 identity multihash).
const RELAY = '12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835';

describe('peerIdConversion (ethers base58 replaces multiformats)', () => {
  test('Ed25519 peer id → bytes32 → peer id round-trips', async () => {
    const b32 = await peerIdToBytes32(RELAY);
    expect(b32).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await bytes32ToPeerId(b32)).toBe(RELAY);
  });

  test('accepts the multibase z-prefixed form', async () => {
    expect(await peerIdToBytes32(`z${RELAY}`)).toBe(await peerIdToBytes32(RELAY));
  });

  test('bytes32ToPeerId accepts hex without 0x', async () => {
    const b32 = await peerIdToBytes32(RELAY);
    expect(await bytes32ToPeerId(b32.slice(2))).toBe(RELAY);
  });

  test('rejects unsupported / non-reversible id shapes (legacy Qm ids cannot round-trip through the Ed25519 encoder — same as mobile)', async () => {
    await expect(peerIdToBytes32('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).rejects.toThrow(/Could not revert/);
    await expect(peerIdToBytes32('111')).rejects.toThrow();
  });
});
