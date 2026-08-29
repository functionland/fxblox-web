import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@reown/appkit/react', () => import('@/components/main/__tests__/appkitReactMock'));

import { appkitState, resetAppkitMock } from '@/components/main/__tests__/appkitReactMock';
import { useUserProfileStore } from '@/stores';
import { useWalletStatus } from '@/hooks/useWalletStatus';

const LINKED = '0x6c249ea1aae83539962df58b630f7b6447f5122f';

describe('useWalletStatus', () => {
  beforeEach(() => {
    resetAppkitMock();
    useUserProfileStore.setState({ manualSignatureWalletAddress: undefined });
  });

  it('a linked address is not a connection', () => {
    // The whole point. This value is written once by the manual signing path and never cleared; three separate
    // readers treated it as a live wallet, which is how the home screen ticked "connect wallet" while
    // Settings > Pools said "Disconnected".
    useUserProfileStore.setState({ manualSignatureWalletAddress: LINKED });
    const { result } = renderHook(() => useWalletStatus());

    expect(result.current.connected).toBe(false);
    expect(result.current.account).toBeNull();
    expect(result.current.linkedAddress).toBe(LINKED);
    expect(result.current.linkedOnly).toBe(true);
    // Still worth showing — it is who the user is, just not a wallet that can sign.
    expect(result.current.displayAddress).toBe(LINKED);
  });

  it('a live session wins over the linked address', () => {
    useUserProfileStore.setState({ manualSignatureWalletAddress: LINKED });
    appkitState.isConnected = true;
    appkitState.address = '0xabc';
    const { result } = renderHook(() => useWalletStatus());

    expect(result.current.connected).toBe(true);
    expect(result.current.account).toBe('0xabc');
    expect(result.current.displayAddress).toBe('0xabc');
    expect(result.current.linkedOnly).toBe(false);
    // The linked address is still reported — it is a different fact, not a stale one.
    expect(result.current.linkedAddress).toBe(LINKED);
  });

  it('a session without an account is not connected', () => {
    // Every caller wants `connected` in order to do something WITH an address, so a half-open session that has
    // no account yet must not read as ready.
    appkitState.isConnected = true;
    appkitState.address = undefined;
    const { result } = renderHook(() => useWalletStatus());

    expect(result.current.connected).toBe(false);
    expect(result.current.account).toBeNull();
    expect(result.current.displayAddress).toBeNull();
    expect(result.current.linkedOnly).toBe(false);
  });

  it('reports nothing when there is neither', () => {
    const { result } = renderHook(() => useWalletStatus());
    expect(result.current).toEqual({
      connected: false,
      account: null,
      linkedAddress: null,
      displayAddress: null,
      linkedOnly: false,
    });
  });
});
