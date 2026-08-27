import { useRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const probeNoCorsMock = vi.hoisted(() =>
  vi.fn<() => Promise<'reachable' | 'unreachable' | 'timeout'>>(async () => 'reachable'),
);
vi.mock('@/platform/lanHttp', async (orig) => ({
  ...(await orig<typeof import('@/platform/lanHttp')>()),
  probeNoCors: probeNoCorsMock,
}));

import { TestProviders } from '@/test/helpers/renderWithProviders';
import { ConnectionOptionsSheet, PING_URL, PING_CLUSTER_URL, pingPeerId } from '@/components/ConnectionOptionsSheet';
import { resetStores, setPairedStores, TEST_BLOX_PEER_ID } from '@/components/main/__tests__/testUtils';
import type { FxSheetMethods } from '@functionland/fx-ui';

function Host({ onSelected }: { onSelected?: (t: string) => void }) {
  const ref = useRef<FxSheetMethods>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.present()} data-testid="open">
        open
      </button>
      <ConnectionOptionsSheet ref={ref} onSelected={onSelected} />
    </>
  );
}

const originalFetch = globalThis.fetch;

describe('ConnectionOptionsSheet', () => {
  beforeEach(() => {
    resetStores();
    setPairedStores();
    probeNoCorsMock.mockResolvedValue('reachable');
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('offers Retry / Connect to Wi-Fi and pings the Blox and its cluster with inline status', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ peerId: TEST_BLOX_PEER_ID });
      if (url === PING_URL) return new Response(JSON.stringify({ success: true, latency: 42 }), { status: 200 });
      if (url === PING_CLUSTER_URL) return new Response(JSON.stringify({ success: false }), { status: 200 });
      throw new TypeError('unexpected');
    }) as typeof fetch;
    const onSelected = vi.fn();
    render(
      <TestProviders>
        <Host onSelected={onSelected} />
      </TestProviders>,
    );
    fireEvent.click(screen.getByTestId('open'));
    fireEvent.click(await screen.findByTestId('connection-option-retry'));
    expect(onSelected).toHaveBeenCalledWith('RETRY');

    fireEvent.click(screen.getByTestId('connection-option-ping-blox'));
    const blox = await screen.findByTestId('ping-blox-status');
    expect(blox).toHaveAttribute('data-status', 'connected');
    expect(blox).toHaveTextContent('Connected (42ms)');

    fireEvent.click(screen.getByTestId('connection-option-ping-cluster'));
    const cluster = await screen.findByTestId('ping-cluster-status');
    expect(cluster).toHaveAttribute('data-status', 'disconnected');
    expect(cluster).toHaveTextContent('Disconnected (Not reachable)');
    expect(calls).toEqual([PING_URL, PING_CLUSTER_URL]);
  });

  it('reports an unreachable pools.fx.land and rate limiting', async () => {
    probeNoCorsMock.mockResolvedValueOnce('unreachable');
    expect(await pingPeerId('p')).toEqual({ status: 'error', message: 'main.blox.connection.cannotReachPools', messageIsKey: true });

    globalThis.fetch = (async () => new Response(JSON.stringify({ status: 'err', msg: 'Too many requests' }), { status: 429 })) as typeof fetch;
    expect(await pingPeerId('p')).toEqual({ status: 'error', message: 'Too many requests' });

    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    render(
      <TestProviders>
        <Host />
      </TestProviders>,
    );
    fireEvent.click(screen.getByTestId('open'));
    fireEvent.click(await screen.findByTestId('connection-option-ping-blox'));
    await waitFor(() => expect(screen.getByTestId('ping-blox-status')).toHaveAttribute('data-status', 'error'));
    expect(screen.getByTestId('ping-blox-status')).toHaveTextContent('Error (Failed to fetch)');
  });
});
