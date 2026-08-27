import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/fula', () => ({
  fula: { isReady: vi.fn(async () => true) },
  blockchain: {},
  fxblox: {
    listActivePlugins: vi.fn(),
    installPlugin: vi.fn(async () => ({ status: true, msg: 'installed' })),
    uninstallPlugin: vi.fn(async () => ({ status: true, msg: 'removed' })),
    getInstallStatus: vi.fn(async () => ({ status: true, msg: 'No Status' })),
    getInstallOutput: vi.fn(async () => ({ status: true, msg: { key: 'v' } })),
    updatePlugin: vi.fn(async () => ({ status: true, msg: 'updated' })),
  },
  identity: {},
  configure: vi.fn(),
}));

import { fula, fxblox } from '@/lib/fula';
import * as Helper from '@/utils/helper';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { sleep } from '@/test/helpers/waitFor';

const listMock = fxblox.listActivePlugins as unknown as ReturnType<typeof vi.fn>;
const isReadyMock = fula.isReady as unknown as ReturnType<typeof vi.fn>;
const P1 = '12D3KooWOne';
const P2 = '12D3KooWTwo';

beforeEach(() => {
  listMock.mockReset();
  isReadyMock.mockReset().mockResolvedValue(true);
  usePluginsStore.getState().reset();
  useBloxsStore.setState({ currentBloxPeerId: P1, bloxs: { [P1]: { peerId: P1, name: '1' }, [P2]: { peerId: P2, name: '2' } } });
});

describe('usePluginsStore.listActivePlugins', () => {
  test('concurrent calls for the same blox + generation collapse into ONE client call', async () => {
    listMock.mockImplementation(async () => {
      await sleep(20);
      return { status: true, msg: ['blox-ai'] };
    });
    const [r1, r2, r3] = await Promise.all([
      usePluginsStore.getState().listActivePlugins(),
      usePluginsStore.getState().listActivePlugins(),
      usePluginsStore.getState().listActivePlugins(),
    ]);
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
    expect(usePluginsStore.getState().activePluginsByBlox[P1]).toEqual(['blox-ai']);
    expect(usePluginsStore.getState().activePluginsStatusByBlox[P1]).toBe('loaded');
  });

  test('a new generation (client re-init) does not join the previous in-flight call', async () => {
    listMock.mockImplementation(async () => {
      await sleep(20);
      return { status: true, msg: [] };
    });
    const first = usePluginsStore.getState().listActivePlugins();
    await sleep(5); // let the first call capture its generation and start the client call
    Helper.resetInitFula();
    const second = usePluginsStore.getState().listActivePlugins();
    await Promise.all([first, second]);
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  test('a response that lands after a blox switch is dropped, never written under the old or new key', async () => {
    listMock.mockImplementation(async () => {
      useBloxsStore.setState({ currentBloxPeerId: P2 });
      return { status: true, msg: ['late-plugin'] };
    });
    const r = await usePluginsStore.getState().listActivePlugins();
    expect(r.message).toMatch(/dropped/);
    expect(usePluginsStore.getState().activePluginsByBlox).toEqual({});
  });

  test('status flow idle → loading → loaded, and a refetch failure keeps the last good list', async () => {
    expect(usePluginsStore.getState().activePluginsStatusByBlox[P1]).toBeUndefined();
    listMock.mockResolvedValueOnce({ status: true, msg: ['a'] });
    await usePluginsStore.getState().listActivePlugins();
    expect(usePluginsStore.getState().activePluginsStatusByBlox[P1]).toBe('loaded');
    listMock.mockRejectedValueOnce(new Error('unreachable'));
    const r = await usePluginsStore.getState().listActivePlugins();
    expect(r.success).toBe(false);
    expect(usePluginsStore.getState().activePluginsStatusByBlox[P1]).toBe('loaded');
    expect(usePluginsStore.getState().activePluginsByBlox[P1]).toEqual(['a']);
  });

  test('first failure surfaces error status; fula not ready → error', async () => {
    isReadyMock.mockResolvedValueOnce(false);
    const r = await usePluginsStore.getState().listActivePlugins();
    expect(r.success).toBe(false);
    expect(usePluginsStore.getState().activePluginsStatusByBlox[P1]).toBe('error');
  });

  test('identical refetch keeps the same array reference (no consumer churn)', async () => {
    listMock.mockResolvedValue({ status: true, msg: ['a', 'b'] });
    await usePluginsStore.getState().listActivePlugins();
    const before = usePluginsStore.getState().activePluginsByBlox;
    await usePluginsStore.getState().listActivePlugins();
    expect(usePluginsStore.getState().activePluginsByBlox).toBe(before);
  });

  test('no blox selected → returns failure without a client call', async () => {
    useBloxsStore.setState({ currentBloxPeerId: undefined });
    const r = await usePluginsStore.getState().listActivePlugins();
    expect(r).toEqual({ success: false, message: 'No blox selected' });
    expect(listMock).not.toHaveBeenCalled();
  });

  test('removePluginsForBlox drops one blox only', async () => {
    usePluginsStore.setState({ activePluginsByBlox: { [P1]: ['a'], [P2]: ['b'] }, activePluginsStatusByBlox: { [P1]: 'loaded', [P2]: 'loaded' } });
    usePluginsStore.getState().removePluginsForBlox(P1);
    expect(usePluginsStore.getState().activePluginsByBlox).toEqual({ [P2]: ['b'] });
    expect(usePluginsStore.getState().activePluginsStatusByBlox).toEqual({ [P2]: 'loaded' });
  });

  test('install/uninstall/update refresh the list; getInstallStatus maps "No Status" to empty', async () => {
    listMock.mockResolvedValue({ status: true, msg: ['x'] });
    expect((await usePluginsStore.getState().installPlugin('x', '{}')).success).toBe(true);
    expect((await usePluginsStore.getState().uninstallPlugin('x')).success).toBe(true);
    expect((await usePluginsStore.getState().updatePlugin('x')).success).toBe(true);
    expect(listMock).toHaveBeenCalledTimes(3);
    expect(await usePluginsStore.getState().getInstallStatus('x')).toEqual({ success: true, message: '' });
    expect(await usePluginsStore.getState().getInstallOutput('x', '{}')).toEqual({ success: true, message: '{"key":"v"}' });
    expect(usePluginsStore.getState().lastOperation.action).toBe('uninstall');
  });
});
