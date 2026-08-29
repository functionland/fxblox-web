import { describe, expect, it } from 'vitest';
import { isBloxPeerId, normalizeBloxPeerId } from '../bloxPeerId';

const BLOX = '12D3KooWD3fmVvqP6GCSXfNviHf6hTa5RxD7udQbb3Sc14sdJpP7';
const RELAY = '12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835';

describe('normalizeBloxPeerId', () => {
  it('accepts a bare peer id', () => {
    expect(normalizeBloxPeerId(BLOX)).toBe(BLOX);
    expect(isBloxPeerId(BLOX)).toBe(true);
  });

  it('tolerates the whitespace a paste brings with it', () => {
    expect(normalizeBloxPeerId(`  ${BLOX}\n`)).toBe(BLOX);
  });

  it('takes the LAST /p2p/ component of a circuit multiaddr', () => {
    // The first one is the relay. Taking it would add the wrong device — and one the user does not own.
    const addr = `/dns/relay.dev.fx.land/tcp/4001/p2p/${RELAY}/p2p-circuit/p2p/${BLOX}`;
    expect(normalizeBloxPeerId(addr)).toBe(BLOX);
  });

  it('accepts a bare /p2p/<id> fragment', () => {
    expect(normalizeBloxPeerId(`/p2p/${BLOX}`)).toBe(BLOX);
  });

  it('rejects anything that is not a well-formed Ed25519 peer id', () => {
    expect(normalizeBloxPeerId('')).toBeNull();
    expect(normalizeBloxPeerId('   ')).toBeNull();
    expect(normalizeBloxPeerId('192.168.2.159')).toBeNull(); // an address, not an id
    expect(normalizeBloxPeerId(BLOX.slice(0, -1))).toBeNull(); // truncated paste
    expect(normalizeBloxPeerId(BLOX + 'x')).toBeNull();
    expect(normalizeBloxPeerId('QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx5N')).toBeNull(); // RSA/Qm form
    // Characters base58btc omits, at the right length — a hand-transcribed id with O for 0, or l for 1.
    expect(normalizeBloxPeerId('12D3KooW' + 'O'.repeat(44))).toBeNull();
    expect(normalizeBloxPeerId('12D3KooW' + 'l'.repeat(44))).toBeNull();
  });
});
