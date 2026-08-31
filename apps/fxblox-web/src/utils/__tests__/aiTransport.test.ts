/**
 * Ported from apps/box/src/utils/__tests__/aiTransport.test.ts — `mdnsCache` → `lanIpCache`.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../lanIpCache', () => ({
  findAuthorizedBlox: vi.fn(),
  refreshOnce: vi.fn().mockResolvedValue(undefined),
  rememberedLanIp: vi.fn().mockResolvedValue(null),
  noteRecord: vi.fn(),
  noteLanIp: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@/services/lanDiscovery', () => ({
  discoverBloxesOnLan: vi.fn().mockResolvedValue({ found: [], failure: 'not-found', lna: 'granted' }),
}));

vi.mock('../httpAiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../httpAiClient')>();
  return { ...actual, HttpAiClient: vi.fn() };
});

import { ipIsPrivateLan, selectAiTransport } from '../aiTransport';
import * as lanIpCache from '../lanIpCache';
import { HttpAiClient } from '../httpAiClient';
import { discoverBloxesOnLan } from '@/services/lanDiscovery';

const findAuthorizedBlox = lanIpCache.findAuthorizedBlox as unknown as ReturnType<typeof vi.fn>;
const refreshOnce = lanIpCache.refreshOnce as unknown as ReturnType<typeof vi.fn>;
const rememberedLanIp = lanIpCache.rememberedLanIp as unknown as ReturnType<typeof vi.fn>;
const noteLanIp = lanIpCache.noteLanIp as unknown as ReturnType<typeof vi.fn>;
const discoverMock = discoverBloxesOnLan as unknown as ReturnType<typeof vi.fn>;
const HttpAiClientMock = HttpAiClient as unknown as ReturnType<typeof vi.fn>;

function record(over: Record<string, unknown> = {}, host = '192.168.1.50') {
  return {
    service: {
      txt: { bloxPeerIdString: 'BLOX1', authorizer: 'APP1', hardwareID: 'HW1', ipAddress: host, ...over },
      host,
      addresses: [host],
      name: 'fulatower',
      fullName: 'fulatower._fulatower._tcp',
      port: 8080,
    },
    observedAt: Date.now(),
  };
}

beforeEach(() => {
  findAuthorizedBlox.mockReset();
  refreshOnce.mockReset().mockResolvedValue(undefined);
  rememberedLanIp.mockReset().mockResolvedValue(null);
  noteLanIp.mockReset();
  discoverMock.mockReset().mockResolvedValue({ found: [], failure: 'not-found', lna: 'granted' });
  HttpAiClientMock.mockReset();
});

/**
 * `new HttpAiClient(ip, port)` whose /health succeeds only for `healthyIp`.
 *
 * `identity` answers with the expected peer id by default: /health only proves something is listening, so the
 * selector also checks `diag/kubo_health`'s peer_id before trusting an address it chose itself.
 */
function clientHealthyAt(healthyIp: string, identityPeerId: string | null = 'BLOX1') {
  return (ip: string, port: number) => ({
    ip,
    port,
    health: vi
      .fn()
      .mockResolvedValue(ip === healthyIp ? { ok: true, latencyMs: 7 } : { ok: false, latencyMs: 1000 }),
    identity: vi.fn().mockResolvedValue(identityPeerId ? { peerId: identityPeerId } : null),
  });
}

describe('ipIsPrivateLan — RFC1918 + link-local accept; loopback reject', () => {
  test.each([
    ['10.0.0.1', true],
    ['10.42.0.5', true],
    ['192.168.1.50', true],
    ['172.16.0.10', true],
    ['172.31.255.255', true],
    ['169.254.1.1', true],
    ['127.0.0.1', false],
    ['127.255.255.255', false],
    ['172.15.0.1', false],
    ['172.32.0.1', false],
    ['169.255.0.1', false],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['', false],
    ['not-an-ip', false],
    ['192.168.1', false],
    ['192.168.1.1.5', false],
    ['256.0.0.1', false],
    ['fe80::1', false],
    ['0.0.0.0', false],
    ['255.255.255.255', false],
    ['192.167.0.1', false],
    ['192.169.0.1', false],
    ['localhost', false],
  ])('%s -> %s', (ip, expected) => {
    expect(ipIsPrivateLan(ip)).toBe(expected);
  });
});

describe('selectAiTransport — happy path', () => {
  test('fresh record + RFC1918 IP + healthy probe → LAN HTTP', async () => {
    findAuthorizedBlox.mockReturnValue(record());
    HttpAiClientMock.mockImplementation((ip: string, port: number) => ({
      ip,
      port,
      baseUrl: `http://${ip}:${port}`,
      health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 15 }),
    }));

    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });

    expect(choice.kind).toBe('lan-http');
    expect(HttpAiClientMock).toHaveBeenCalledWith('192.168.1.50', 8083);
    expect(refreshOnce).not.toHaveBeenCalled();
  });
});

describe('selectAiTransport — fall back to BLE', () => {
  test('no record + default scanIfEmpty=false → BLE WITHOUT triggering refreshOnce', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    const choice = await selectAiTransport('BLOX1', 'APP1');
    expect(choice.kind).toBe('ble');
    expect(refreshOnce).not.toHaveBeenCalled();
    expect(choice.reason).toMatch(/no LAN candidate/);
  });

  test('no record + scanIfEmpty=true → triggers refreshOnce (opt-in) with both peer ids', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: true });
    expect(choice.kind).toBe('ble');
    expect(refreshOnce).toHaveBeenCalledTimes(1);
    expect(refreshOnce).toHaveBeenCalledWith('BLOX1', 'APP1');
  });

  test('record but IP not RFC1918 → BLE', async () => {
    findAuthorizedBlox.mockReturnValue(record({ ipAddress: '8.8.8.8' }, '8.8.8.8'));
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(choice.kind).toBe('ble');
    expect(choice.reason).toMatch(/not RFC1918/);
    expect(HttpAiClientMock).not.toHaveBeenCalled();
  });

  test('record + RFC1918 IP but /health fails → BLE', async () => {
    findAuthorizedBlox.mockReturnValue(record());
    HttpAiClientMock.mockImplementation(() => ({ health: vi.fn().mockResolvedValue({ ok: false, latencyMs: 1200 }) }));
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(choice.kind).toBe('ble');
    expect(choice.reason).toMatch(/probe failed/);
  });

  test('missing peer IDs → BLE without scan', async () => {
    const a = await selectAiTransport('', 'APP1');
    const b = await selectAiTransport('BLOX1', '');
    expect(a.kind).toBe('ble');
    expect(b.kind).toBe('ble');
    expect(refreshOnce).not.toHaveBeenCalled();
  });
});

describe('selectAiTransport — port discovery', () => {
  test('TXT bloxAiPort override → HttpAiClient uses it', async () => {
    findAuthorizedBlox.mockReturnValue(record({ ipAddress: '10.0.0.5', bloxAiPort: '8084' }, '10.0.0.5'));
    HttpAiClientMock.mockImplementation(() => ({ health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 10 }) }));
    await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(HttpAiClientMock).toHaveBeenCalledWith('10.0.0.5', 8084);
  });

  test('malformed bloxAiPort → default 8083', async () => {
    findAuthorizedBlox.mockReturnValue(record({ ipAddress: '10.0.0.5', bloxAiPort: 'not-a-port' }, '10.0.0.5'));
    HttpAiClientMock.mockImplementation(() => ({ health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 10 }) }));
    await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(HttpAiClientMock).toHaveBeenCalledWith('10.0.0.5', 8083);
  });
});

describe('selectAiTransport — manual IP fallback', () => {
  test('a fresh cache hit wins over a provided manual IP', async () => {
    findAuthorizedBlox.mockReturnValue(record());
    HttpAiClientMock.mockImplementation((ip: string, port: number) => ({
      ip,
      port,
      health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 12 }),
    }));
    const choice = await selectAiTransport('BLOX1', 'APP1', { manualIp: '10.0.0.99', scanIfEmpty: false });
    expect(choice.kind).toBe('lan-http');
    expect(choice.reason).toMatch(/mDNS verified/);
    expect(HttpAiClientMock).toHaveBeenCalledTimes(1);
    expect(HttpAiClientMock).toHaveBeenCalledWith('192.168.1.50', 8083);
  });

  test('cache miss → manual IP qualifies and is tried BEFORE the refresh', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    HttpAiClientMock.mockImplementation((ip: string, port: number) => ({
      ip,
      port,
      health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 20 }),
      identity: vi.fn().mockResolvedValue({ peerId: 'BLOX1' }),
    }));
    const choice = await selectAiTransport('BLOX1', 'APP1', { manualIp: '192.168.1.77', scanIfEmpty: true });
    expect(choice.kind).toBe('lan-http');
    expect(choice.reason).toMatch(/manual IP 192\.168\.1\.77/);
    expect(HttpAiClientMock).toHaveBeenCalledWith('192.168.1.77', 8083);
    expect(refreshOnce).not.toHaveBeenCalled();
  });

  test('manual IP present but /health fails → falls through (never strands)', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    HttpAiClientMock.mockImplementation((ip: string, port: number) => ({
      ip,
      port,
      health: vi.fn().mockResolvedValue({ ok: false, latencyMs: 1100 }),
    }));
    const choice = await selectAiTransport('BLOX1', 'APP1', { manualIp: '192.168.1.77', scanIfEmpty: false });
    expect(choice.kind).toBe('ble');
    expect(choice.reason).toMatch(/no LAN candidate/);
    expect(HttpAiClientMock).toHaveBeenCalledWith('192.168.1.77', 8083);
  });

  test('non-RFC1918 manual IP is rejected without building a client (security backstop)', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    const choice = await selectAiTransport('BLOX1', 'APP1', { manualIp: '8.8.8.8', scanIfEmpty: false });
    expect(choice.kind).toBe('ble');
    expect(HttpAiClientMock).not.toHaveBeenCalled();
  });

  test('missing peer IDs + valid manual IP → manual IP is the sole LAN path', async () => {
    HttpAiClientMock.mockImplementation((ip: string, port: number) => ({
      ip,
      port,
      health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 18 }),
    }));
    const choice = await selectAiTransport('', 'APP1', { manualIp: '192.168.1.77' });
    expect(choice.kind).toBe('lan-http');
    expect(choice.reason).toMatch(/manual IP 192\.168\.1\.77/);
    expect(findAuthorizedBlox).not.toHaveBeenCalled();
  });

  test('missing peer IDs + non-RFC1918 manual IP → BLE (missing-peer reason), no client', async () => {
    const choice = await selectAiTransport('', 'APP1', { manualIp: '8.8.8.8' });
    expect(choice.kind).toBe('ble');
    expect(choice.reason).toMatch(/missing bloxPeerId or appPeerId/);
    expect(HttpAiClientMock).not.toHaveBeenCalled();
  });
});

/**
 * A browser has no mDNS, so without this tier the only automatic LAN candidate was a record from the current
 * page session. A reload therefore left Blox AI with nothing to try — /find-box is blocked for browsers and no
 * manual IP is set by default — and it reported "Cannot reach your Blox over LAN or Bluetooth" about a Blox
 * that setup had successfully talked to minutes earlier.
 */
describe('selectAiTransport — remembered LAN IP from a previous session', () => {
  test('no fresh record and no manual IP → the remembered address is probed and used', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    rememberedLanIp.mockResolvedValue({ ip: '192.168.2.159', authorizer: 'APP1', savedAt: 1 });
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.2.159'));

    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: true });

    expect(choice.kind).toBe('lan-http');
    expect(choice.reason).toMatch(/remembered IP 192\.168\.2\.159/);
    expect(HttpAiClientMock).toHaveBeenCalledWith('192.168.2.159', 8083);
    // It answered, so the (browser-blocked) discovery refresh was never needed.
    expect(refreshOnce).not.toHaveBeenCalled();
  });

  test('age is not a gate — only the /health probe decides', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    rememberedLanIp.mockResolvedValue({ ip: '192.168.2.159', authorizer: 'APP1', savedAt: 0 }); // ancient
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.2.159'));
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(choice.kind).toBe('lan-http');
  });

  test('the Blox moved: the remembered address no longer answers → falls through, never strands', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    rememberedLanIp.mockResolvedValue({ ip: '192.168.2.159', authorizer: 'APP1', savedAt: Date.now() });
    HttpAiClientMock.mockImplementation(clientHealthyAt('nothing-answers-here'));
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(choice.kind).toBe('ble');
    expect(HttpAiClientMock).toHaveBeenCalledWith('192.168.2.159', 8083);
  });

  test('a typed manual IP wins over the remembered one — the user is correcting us', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    rememberedLanIp.mockResolvedValue({ ip: '192.168.2.159', authorizer: 'APP1', savedAt: Date.now() });
    HttpAiClientMock.mockImplementation(() => ({
      health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 5 }),
      identity: vi.fn().mockResolvedValue({ peerId: 'BLOX1' }),
    }));
    const choice = await selectAiTransport('BLOX1', 'APP1', { manualIp: '192.168.1.77', scanIfEmpty: false });
    expect(choice.reason).toMatch(/manual IP 192\.168\.1\.77/);
    expect(HttpAiClientMock).toHaveBeenCalledTimes(1);
  });

  test('a fresh record still wins over the remembered address', async () => {
    findAuthorizedBlox.mockReturnValue(record());
    rememberedLanIp.mockResolvedValue({ ip: '192.168.2.159', authorizer: 'APP1', savedAt: Date.now() });
    HttpAiClientMock.mockImplementation(() => ({
      health: vi.fn().mockResolvedValue({ ok: true, latencyMs: 5 }),
    }));
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(choice.reason).toMatch(/mDNS verified/);
    expect(HttpAiClientMock).toHaveBeenCalledWith('192.168.1.50', 8083);
  });

  test('a remembered port is honoured over the default', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    rememberedLanIp.mockResolvedValue({ ip: '192.168.2.159', port: 9099, authorizer: 'APP1', savedAt: 1 });
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.2.159'));
    await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(HttpAiClientMock).toHaveBeenCalledWith('192.168.2.159', 9099);
  });
});

/**
 * `/health` proves only that SOMETHING is listening on `<ip>:8083`. Private ranges repeat across networks, so
 * an address remembered at home can point at a stranger's machine on another network with the same subnet —
 * and an approved remediation action would be POSTed to it. An address the app picks on its own must therefore
 * prove which Blox is answering (`diag/kubo_health` → `peer_id`); one the user typed keeps working against
 * firmware too old to answer, but is still refused on a definite mismatch.
 */
describe('selectAiTransport — the address must be the right Blox', () => {
  test('a remembered address answered by a DIFFERENT blox is refused', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    rememberedLanIp.mockResolvedValue({ ip: '192.168.2.159', authorizer: 'APP1', savedAt: 1 });
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.2.159', 'SOMEONE_ELSES_BLOX'));
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(choice.kind).toBe('ble');
  });

  test('a remembered address that cannot prove its identity is refused (it was not user-chosen)', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    rememberedLanIp.mockResolvedValue({ ip: '192.168.2.159', authorizer: 'APP1', savedAt: 1 });
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.2.159', null));
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(choice.kind).toBe('ble');
  });

  test('a typed manual IP still works against firmware that cannot report its identity', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.1.77', null));
    const choice = await selectAiTransport('BLOX1', 'APP1', { manualIp: '192.168.1.77', scanIfEmpty: false });
    expect(choice.kind).toBe('lan-http');
    expect(choice.reason).toMatch(/manual IP/);
  });

  test('a typed manual IP answered by a DIFFERENT blox is refused (catches a typo)', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.1.77', 'SOMEONE_ELSES_BLOX'));
    const choice = await selectAiTransport('BLOX1', 'APP1', { manualIp: '192.168.1.77', scanIfEmpty: false });
    expect(choice.kind).toBe('ble');
  });
});

describe('selectAiTransport — searching this network when nothing else is left', () => {
  // Before this tier existed, a browser with no remembered address and no typed IP had nothing to try:
  // `refreshOnce` only asks discovery `/find-box` for private ip4 entries, which needs unshipped firmware and
  // returns nothing. Blox AI reported "cannot reach your Blox" about a Blox on the same switch.
  test('finds the Blox by scanning and uses it', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    discoverMock.mockResolvedValue({ found: [{ host: '192.168.2.159', peerId: 'BLOX1' }], lna: 'granted' });
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.2.159'));

    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: true });
    expect(choice.kind).toBe('lan-http');
    expect(choice.reason).toContain('network scan found 192.168.2.159');
    // Written back, so the next session takes the remembered-address tier and never pays for a scan again.
    expect(noteLanIp).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '192.168.2.159', bloxPeerId: 'BLOX1', authorizer: 'APP1' }),
    );
  });

  test('a `.local` name is usable, and is not written back to a cache that only holds addresses', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    discoverMock.mockResolvedValue({ found: [{ host: 'fxblox-rk1.local', peerId: 'BLOX1' }], lna: 'granted' });
    HttpAiClientMock.mockImplementation(clientHealthyAt('fxblox-rk1.local'));

    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: true });
    expect(choice.kind).toBe('lan-http');
    expect(noteLanIp).not.toHaveBeenCalled();
  });

  test('a Blox that is not the one we mean is ignored', async () => {
    // The scan reads each answer's peer id, so a private address pointing at someone else's box on another
    // network is rejected before anything is sent to it.
    findAuthorizedBlox.mockReturnValue(null);
    discoverMock.mockResolvedValue({ found: [{ host: '192.168.2.7', peerId: 'SOMEONE-ELSE' }], lna: 'granted' });
    HttpAiClientMock.mockImplementation(clientHealthyAt('192.168.2.7'));

    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: true });
    expect(choice.kind).toBe('ble');
  });

  test('does not scan when the caller did not ask for it', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: false });
    expect(discoverMock).not.toHaveBeenCalled();
    expect(choice.kind).toBe('ble');
  });

  test('a scan that throws falls through to BLE rather than breaking the screen', async () => {
    findAuthorizedBlox.mockReturnValue(null);
    discoverMock.mockRejectedValue(new Error('permission dismissed'));
    const choice = await selectAiTransport('BLOX1', 'APP1', { scanIfEmpty: true });
    expect(choice.kind).toBe('ble');
  });
});