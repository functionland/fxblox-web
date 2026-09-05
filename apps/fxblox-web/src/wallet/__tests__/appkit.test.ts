import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createAppKitMock = vi.hoisted(() =>
  vi.fn((_options: unknown) => ({ setThemeMode: vi.fn(), disconnect: vi.fn() })),
);
vi.mock('@reown/appkit/react', () => ({ createAppKit: createAppKitMock }));
vi.mock('@reown/appkit-adapter-ethers5', () => ({ Ethers5Adapter: class {} }));

import { useSettingsStore } from '@/stores/useSettingsStore';

/** `initAppKit` is a module-level singleton; each test wants a fresh one. */
async function freshInitAppKit() {
  vi.resetModules();
  const mod = await import('../appkit');
  return mod.initAppKit;
}

function metadataPassed(): Record<string, unknown> {
  const call = createAppKitMock.mock.calls.at(-1)?.[0] as { metadata: Record<string, unknown> } | undefined;
  if (!call) throw new Error('createAppKit was not called');
  return call.metadata;
}

describe('initAppKit metadata', () => {
  beforeEach(() => {
    createAppKitMock.mockClear();
    useSettingsStore.setState({ debugMode: undefined });
  });
  afterEach(() => {
    useSettingsStore.setState({ debugMode: undefined });
  });

  it('tells the wallet where to send the user back to, by default', async () => {
    const initAppKit = await freshInitAppKit();
    initAppKit({ themeMode: 'dark' });
    const metadata = metadataPassed();
    expect(metadata.redirect).toEqual(expect.objectContaining({ universal: expect.any(String) }));
    expect(metadata.name).toBe('FxBlox');
  });

  it('in debug mode, omits the return redirect so the wallet leaves the user where they are', async () => {
    // A diagnostic: MetaMask was found already wedged on its splash screen after it sent the user back from
    // a pairing approval, before any deep link reached it. Without a redirect it does not send them back,
    // and the next log says whether it is still healthy when they switch to it by hand.
    useSettingsStore.setState({
      debugMode: { uniqueId: 'dbg', endDate: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    const initAppKit = await freshInitAppKit();
    initAppKit({ themeMode: 'dark' });
    const metadata = metadataPassed();
    expect('redirect' in metadata).toBe(false);
    // Everything else the wallet shows the user is untouched.
    expect(metadata.name).toBe('FxBlox');
    expect(metadata.url).toEqual(expect.any(String));
  });

  it('an expired debug mode counts as off', async () => {
    useSettingsStore.setState({
      debugMode: { uniqueId: 'dbg', endDate: new Date(Date.now() - 1000) },
    });
    const initAppKit = await freshInitAppKit();
    initAppKit({ themeMode: 'dark' });
    expect('redirect' in metadataPassed()).toBe(true);
  });
});
