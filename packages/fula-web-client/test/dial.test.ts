import { describe, expect, it } from 'vitest';
import type { Connection } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';
import { mapDialError, mapStreamError, needsRedial, trackConnection, type TrackedConnection } from '../src/core/dial.js';
import type { Candidate } from '../src/core/discovery.js';

const BOX = '12D3KooWPnaMDrD7QLZKiT2iktjm9Kucx7XEPrSCUS6TTBbYuiRj';
const RELAY = '12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835';
const CIRCUIT = multiaddr(`/dns/relay.dev.fx.land/tcp/4001/p2p/${RELAY}/p2p-circuit/p2p/${BOX}`);

function fakeConnection(over: Partial<Connection> = {}): Connection {
  return {
    status: 'open',
    direct: false,
    remoteAddr: CIRCUIT,
    timeline: { open: 1_000 },
    limits: undefined,
    ...over,
  } as unknown as Connection;
}

const candidate: Candidate = { ma: CIRCUIT, source: 'find-box', relayPeerId: RELAY, relayed: true };
const limits = { maxAgeMs: 28 * 60_000, maxBytes: 12 * 1024 * 1024 };

function named(name: string, message = name): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

describe('connection tracking', () => {
  it('keeps libp2p\'s own open timestamp when adopting a connection', () => {
    const t = trackConnection(fakeConnection({ timeline: { open: 500 } }), candidate, 9_000);
    expect(t.openedAt).toBe(500);
    expect(t.relayed).toBe(true);
    const fresh = trackConnection(fakeConnection({ timeline: { open: 0 } }), candidate, 9_000);
    expect(fresh.openedAt).toBe(9_000);
  });

  it('redials on age, bytes, relay-reported budget or a non-open status — never for direct connections', () => {
    const t = trackConnection(fakeConnection(), candidate, 1_000);
    expect(needsRedial(t, limits, 1_000 + 60_000).redial).toBe(false);
    expect(needsRedial(t, limits, 1_000 + 29 * 60_000)).toMatchObject({ redial: true, reason: expect.stringContaining('age') });
    t.bytes = 13 * 1024 * 1024;
    expect(needsRedial(t, limits, 2_000)).toMatchObject({ redial: true, reason: expect.stringContaining('bytes') });
    const tight = trackConnection(fakeConnection({ limits: { bytes: BigInt(1000), seconds: 3600 } }), candidate, 1_000);
    expect(needsRedial(tight, limits, 2_000).reason).toContain('bytes left');
    const closed = trackConnection(fakeConnection({ status: 'closed' }), candidate, 1_000);
    expect(needsRedial(closed, limits, 2_000).redial).toBe(true);
    const direct = trackConnection(fakeConnection({ direct: true, remoteAddr: multiaddr(`/ip4/1.2.3.4/tcp/4001/p2p/${BOX}`) }), { ma: CIRCUIT, source: 'find-box', relayed: false }, 1_000);
    direct.bytes = 100 * 1024 * 1024;
    expect(needsRedial(direct, limits, 1_000 + 10 * 60 * 60_000).redial).toBe(false);
  });
});

describe('error mapping', () => {
  it('maps circuit STATUS text, certhash failures and timeouts by priority', () => {
    expect(mapDialError(new AggregateError([named('InvalidMessageError', 'failed to connect via relay with status NO_RESERVATION'), named('TimeoutError')], 'all failed'), candidate, false).code).toBe('NO_RESERVATION');
    expect(mapDialError(named('InvalidMessageError', 'failed to connect via relay with status RESOURCE_LIMIT_EXCEEDED'), candidate, false).code).toBe('RELAY_LIMIT');
    expect(mapDialError(named('InvalidParametersError', "Our certhashes are not a subset of the remote's reported certhashes"), candidate, false).code).toBe('NO_CERTHASH');
    expect(mapDialError(named('WebTransportError', 'handshake failed'), candidate, false).code).toBe('NO_CERTHASH');
    expect(mapDialError(named('AbortError', 'The operation was aborted'), candidate, true).code).toBe('DIAL_TIMEOUT');
    expect(mapDialError(new Error('ECONNREFUSED'), candidate, false).code).toBe('DIAL_FAILED');
    expect(mapDialError(new Error('ECONNREFUSED'), candidate, false).message).toContain(CIRCUIT.toString());
  });

  it('blames the relay for a reset only near the relay limits', () => {
    const t: TrackedConnection = trackConnection(fakeConnection(), candidate, 1_000);
    const reset = named('StreamResetError', 'stream reset');
    expect(mapStreamError(reset, t, 'blox-free-space', 1_000 + 60_000).code).toBe('STREAM_ERROR');
    expect(mapStreamError(reset, t, 'blox-free-space', 1_000 + 26 * 60_000).code).toBe('RELAY_LIMIT');
    t.bytes = 11 * 1024 * 1024;
    expect(mapStreamError(reset, t, 'blox-free-space', 2_000).code).toBe('RELAY_LIMIT');
    expect(mapStreamError(named('TransferLimitError', 'data limit exceeded'), t).code).toBe('RELAY_LIMIT');
    expect(mapStreamError(named('UnsupportedProtocolError'), t).code).toBe('UNSUPPORTED_PROTOCOL');
    expect(mapStreamError(named('TimeoutError'), t).code).toBe('TIMEOUT');
    expect(mapStreamError(named('LimitedConnectionError'), t).code).toBe('RELAY_LIMIT');
    expect(mapStreamError(new Error('boom'), undefined, 'reboot').action).toBe('reboot');
  });
});
