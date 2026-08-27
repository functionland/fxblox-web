/**
 * Ported from apps/box/src/utils/__tests__/aiTransport.test.ts — `mdnsCache` → `lanIpCache`.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../lanIpCache', () => ({
  findAuthorizedBlox: vi.fn(),
  refreshOnce: vi.fn().mockResolvedValue(undefined),
  noteRecord: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('../httpAiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../httpAiClient')>();
  return { ...actual, HttpAiClient: vi.fn() };
});

import { ipIsPrivateLan, selectAiTransport } from '../aiTransport';
import * as lanIpCache from '../lanIpCache';
import { HttpAiClient } from '../httpAiClient';

const findAuthorizedBlox = lanIpCache.findAuthorizedBlox as unknown as ReturnType<typeof vi.fn>;
const refreshOnce = lanIpCache.refreshOnce as unknown as ReturnType<typeof vi.fn>;
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
  HttpAiClientMock.mockReset();
});

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
    expect(choice.reason).toMatch(/no fresh mDNS record/);
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
    expect(choice.reason).toMatch(/no fresh mDNS record/);
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
