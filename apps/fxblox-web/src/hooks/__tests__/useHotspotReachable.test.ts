import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/platform/lanHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/lanHttp')>();
  return { ...actual, lanFetch: vi.fn() };
});

import { lanFetch, LanHttpError } from '@/platform/lanHttp';
import { probeHotspot, classify } from '../useHotspotReachable';

const lanFetchMock = lanFetch as unknown as ReturnType<typeof vi.fn>;
const AP = 'http://10.42.0.1:3500';

beforeEach(() => {
  lanFetchMock.mockReset();
});

describe('probeHotspot', () => {
  test('GET /readiness answers → reachable', async () => {
    lanFetchMock.mockResolvedValue(new Response('{"status":"ready"}'));
    expect(await probeHotspot(AP)).toBe('reachable');
    expect(String(lanFetchMock.mock.calls[0]![0])).toBe(`${AP}/readiness`);
  });

  test.each([
    ['http', 'reachable'],
    ['cors', 'blocked'],
    ['lna-denied', 'blocked'],
    ['timeout', 'unreachable'],
    ['unreachable', 'unreachable'],
    ['aborted', 'unknown'],
  ] as const)('LanHttpError kind %s → %s', async (kind, expected) => {
    lanFetchMock.mockRejectedValue(new LanHttpError(kind, AP, kind, { status: kind === 'http' ? 404 : undefined }));
    expect(await probeHotspot(AP)).toBe(expected);
    expect(classify(new LanHttpError(kind, AP, kind))).toBe(expected);
  });

  test('a non-LanHttpError failure → unreachable', async () => {
    lanFetchMock.mockRejectedValue(new Error('weird'));
    expect(await probeHotspot(AP)).toBe('unreachable');
  });
});
