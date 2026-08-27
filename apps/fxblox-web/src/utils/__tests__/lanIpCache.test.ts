/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ported from apps/box/src/utils/__tests__/mdnsCache.test.ts (+ the web-only HTTP/discovery feeders).
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/services/discoveryClient', () => ({ findBox: vi.fn() }));

import * as lanIpCache from '../lanIpCache';
import { findBox } from '@/services/discoveryClient';
import type { MDNSBloxService } from '@/models/blox';

const findBoxMock = findBox as unknown as ReturnType<typeof vi.fn>;

function makeRecord(over: Partial<MDNSBloxService['txt']> = {}, host = '192.168.1.10'): MDNSBloxService {
  return {
    addresses: [host],
    fullName: `fulatower@${host}._fulatower._tcp`,
    host,
    name: 'fulatower',
    port: 8080,
    txt: { authorizer: 'APP1', bloxPeerIdString: 'BLOX1', hardwareID: 'HW1', poolName: 'p', ipAddress: host, ...over },
  };
}

beforeEach(() => {
  lanIpCache.clear();
  findBoxMock.mockReset();
});

describe('lanIpCache.noteRecord + findAuthorizedBlox', () => {
  test('authorized blox is found by bloxPeerId+appPeerId match', () => {
    lanIpCache.noteRecord(makeRecord());
    const hit = lanIpCache.findAuthorizedBlox('BLOX1', 'APP1');
    expect(hit).not.toBeNull();
    expect(hit!.service.txt.hardwareID).toBe('HW1');
  });

  test('authorizer mismatch → not found', () => {
    lanIpCache.noteRecord(makeRecord({ authorizer: 'OTHER_APP' }));
    expect(lanIpCache.findAuthorizedBlox('BLOX1', 'APP1')).toBeNull();
  });

  test('bloxPeerId mismatch → not found', () => {
    lanIpCache.noteRecord(makeRecord());
    expect(lanIpCache.findAuthorizedBlox('SOMETHING_ELSE', 'APP1')).toBeNull();
  });

  test('multiple bloxes — picks the correct one by peerId', () => {
    lanIpCache.noteRecord(makeRecord({ bloxPeerIdString: 'BLOX1', hardwareID: 'HW1' }, '192.168.1.10'));
    lanIpCache.noteRecord(makeRecord({ bloxPeerIdString: 'BLOX2', hardwareID: 'HW2' }, '192.168.1.20'));
    expect(lanIpCache.findAuthorizedBlox('BLOX1', 'APP1')!.service.txt.hardwareID).toBe('HW1');
    expect(lanIpCache.findAuthorizedBlox('BLOX2', 'APP1')!.service.txt.hardwareID).toBe('HW2');
  });

  test('noteRecord updates observedAt on re-insert', async () => {
    const r = makeRecord();
    lanIpCache.noteRecord(r);
    const firstAt = lanIpCache.findAuthorizedBlox('BLOX1', 'APP1')!.observedAt;
    await new Promise((res) => setTimeout(res, 5));
    lanIpCache.noteRecord(r);
    expect(lanIpCache.findAuthorizedBlox('BLOX1', 'APP1')!.observedAt).toBeGreaterThan(firstAt);
  });
});

describe('lanIpCache freshness gating', () => {
  test('stale record older than maxAgeMs is rejected', () => {
    lanIpCache.noteRecord(makeRecord());
    const cached = Array.from(lanIpCache._internalRecords().values())[0]!;
    (cached as any).observedAt = Date.now() - 200_000;
    expect(lanIpCache.findAuthorizedBlox('BLOX1', 'APP1', 90_000)).toBeNull();
  });

  test('within freshness window → still found', () => {
    lanIpCache.noteRecord(makeRecord());
    const cached = Array.from(lanIpCache._internalRecords().values())[0]!;
    (cached as any).observedAt = Date.now() - 5_000;
    expect(lanIpCache.findAuthorizedBlox('BLOX1', 'APP1', 90_000)).not.toBeNull();
  });
});

describe('lanIpCache.clear', () => {
  test('removes all records', () => {
    lanIpCache.noteRecord(makeRecord({ bloxPeerIdString: 'A', hardwareID: 'H1' }));
    lanIpCache.noteRecord(makeRecord({ bloxPeerIdString: 'B', hardwareID: 'H2' }));
    lanIpCache.clear();
    expect(lanIpCache.findAuthorizedBlox('A', 'APP1')).toBeNull();
    expect(lanIpCache._internalRecords().size).toBe(0);
  });
});

describe('web feeders', () => {
  test('noteFromProperties records a private ip with the properties identity', () => {
    lanIpCache.noteFromProperties('192.168.7.7', { kubo_peer_id: 'BLOX9', authorizer: 'APP1', hardwareID: 'HW9', ipfs_cluster_peer_id: 'CL9' }, 3500);
    const hit = lanIpCache.findAuthorizedBlox('BLOX9', 'APP1');
    expect(hit!.service.txt.ipAddress).toBe('192.168.7.7');
    expect(hit!.service.txt.ipfsClusterID).toBe('CL9');
    expect(hit!.service.port).toBe(3500);
  });

  test('noteLanIp refuses non-private addresses', () => {
    lanIpCache.noteLanIp({ ip: '8.8.8.8', bloxPeerId: 'B', authorizer: 'A' });
    expect(lanIpCache._internalRecords().size).toBe(0);
  });

  test('privateIpsFromMultiaddrs keeps only non-circuit private /ip4 entries', () => {
    expect(
      lanIpCache.privateIpsFromMultiaddrs([
        '/ip4/192.168.1.5/udp/4001/quic-v1/webtransport/certhash/uEi',
        '/ip4/8.8.8.8/tcp/4001',
        '/dns/relay/tcp/4001/p2p/R/p2p-circuit/p2p/B',
        '/ip4/10.0.0.2/tcp/4001',
        '/ip4/192.168.1.5/tcp/4001',
      ]),
    ).toEqual(['192.168.1.5', '10.0.0.2']);
  });

  test('refreshOnce feeds discovery private ips tagged with the caller appPeerId; concurrent calls share one fetch', async () => {
    findBoxMock.mockResolvedValue(['/ip4/192.168.1.5/udp/4001/quic-v1/webtransport/certhash/x', '/dns/relay/tcp/4001/p2p/R/p2p-circuit/p2p/BLOX1']);
    const p1 = lanIpCache.refreshOnce('BLOX1', 'APP1');
    const p2 = lanIpCache.refreshOnce('BLOX1', 'APP1');
    expect(p2).toBe(p1);
    await p1;
    expect(findBoxMock).toHaveBeenCalledTimes(1);
    expect(lanIpCache.findAuthorizedBlox('BLOX1', 'APP1')!.service.txt.ipAddress).toBe('192.168.1.5');
  });

  test('refreshOnce without ids resolves immediately without fetching', async () => {
    await lanIpCache.refreshOnce();
    expect(findBoxMock).not.toHaveBeenCalled();
  });
});
