import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACCOUNT_FUND_AMOUNT, ACTIONS, isOkStatus, wireActionNames } from '../src/core/actions.js';

interface SigningVector {
  action: string;
  body: string;
}

const signingVectors = JSON.parse(readFileSync(fileURLToPath(new URL('./vectors/signing.json', import.meta.url)), 'utf8')) as SigningVector[];

describe('action table', () => {
  it('uses the go-fula wire names for every method apps/box calls', () => {
    const expected: Record<string, string> = {
      bloxFreeSpace: 'blox-free-space',
      reboot: 'reboot',
      wifiRemoveall: 'wifi-removeall',
      partition: 'partition',
      getClusterInfo: 'get-cluster-info',
      listActivePlugins: 'list-active-plugins',
      installPlugin: 'install-plugin',
      getInstallOutput: 'get-install-output',
      uninstallPlugin: 'uninstall-plugin',
      getInstallStatus: 'get-install-status',
      updatePlugin: 'update-plugin',
      fetchContainerLogs: 'fetch-container-logs',
      getFolderSize: 'get-folder-size',
      getDatastoreSize: 'get-datastore-size',
      accountFund: 'account-fund',
      createAccount: 'account-create',
      joinPoolWithChain: 'fula-pool-join',
      leavePoolWithChain: 'fula-pool-leave',
      autoPinPair: 'auto-pin-pair',
    };
    for (const [key, wire] of Object.entries(expected)) {
      expect(ACTIONS[key as keyof typeof ACTIONS].action, key).toBe(wire);
    }
    expect(wireActionNames()).toContain('erase-blockchain-data');
    expect(wireActionNames()).toContain('find-bestandtarget-inlogs');
  });

  it('sends "{}" for argument-less actions', () => {
    for (const key of ['bloxFreeSpace', 'reboot', 'wifiRemoveall', 'partition', 'getClusterInfo', 'listActivePlugins', 'getDatastoreSize', 'createAccount', 'autoPinUnpair'] as const) {
      expect(ACTIONS[key].encode()).toBe('{}');
    }
  });

  it('account-fund body is the exact go-fula form: bare BigInt amount, "to" string (matches the golden vector)', () => {
    const to = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
    const body = ACTIONS.accountFund.encode(to);
    expect(body).toBe(`{"amount":${ACCOUNT_FUND_AMOUNT},"to":"${to}"}`);
    expect(body).toBe('{"amount":1000000000000000000,"to":"5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"}');
    const vector = signingVectors.find((v) => v.action === 'account-fund');
    expect(vector?.body).toBe(body);
  });

  it('fetch-container-logs uses the capitalised Go field names (struct has no json tags)', () => {
    const body = ACTIONS.fetchContainerLogs.encode('fula_go', '50');
    expect(JSON.parse(body)).toEqual({ ContainerName: 'fula_go', TailCount: '50' });
    // the golden vector body carries Go's trailing newline from json.Encoder; the object form is identical
    const vector = signingVectors.find((v) => v.action === 'fetch-container-logs');
    expect(JSON.parse(vector?.body ?? '{}')).toEqual(JSON.parse(body));
  });

  it('fula-pool-join carries the BLOX peer id, an integer pool id and the chain name', () => {
    const body = ACTIONS.joinPoolWithChain.encode(7, '12D3KooWBlox', 'skale');
    expect(JSON.parse(body)).toEqual({ pool_id: 7, peer_id: '12D3KooWBlox', chain_name: 'skale' });
    expect(JSON.parse(ACTIONS.leavePoolWithChain.encode(7, 'base'))).toEqual({ pool_id: 7, chain_name: 'base' });
    expect(JSON.parse(ACTIONS.joinPool.encode(7, '12D3KooWBlox'))).toEqual({ pool_id: 7, peer_id: '12D3KooWBlox' });
  });

  it('plugin / folder / autopin bodies use the go-fula json tags', () => {
    expect(JSON.parse(ACTIONS.installPlugin.encode('blox-ai', 'a=b'))).toEqual({ plugin_name: 'blox-ai', params: 'a=b' });
    expect(JSON.parse(ACTIONS.uninstallPlugin.encode('blox-ai'))).toEqual({ plugin_name: 'blox-ai' });
    expect(JSON.parse(ACTIONS.getInstallOutput.encode('blox-ai', ''))).toEqual({ plugin_name: 'blox-ai', params: '' });
    expect(JSON.parse(ACTIONS.getFolderSize.encode('/uniondrive'))).toEqual({ folder_path: '/uniondrive' });
    expect(JSON.parse(ACTIONS.autoPinPair.encode('tok', 'https://api.cloud.fx.land'))).toEqual({ pinning_token: 'tok', pinning_endpoint: 'https://api.cloud.fx.land' });
  });

  it('expected statuses follow the go-fula client checks', () => {
    expect(isOkStatus(ACTIONS.bloxFreeSpace, 200)).toBe(true);
    expect(isOkStatus(ACTIONS.bloxFreeSpace, 202)).toBe(false);
    expect(isOkStatus(ACTIONS.fetchContainerLogs, 202)).toBe(true);
    expect(isOkStatus(ACTIONS.fetchContainerLogs, 200)).toBe(false);
    expect(isOkStatus(ACTIONS.accountFund, 202)).toBe(true);
    expect(isOkStatus(ACTIONS.joinPoolWithChain, 202)).toBe(true);
    expect(isOkStatus(ACTIONS.autoPinPair, 200)).toBe(true);
    // the Go plugin client functions never check the status
    expect(isOkStatus(ACTIONS.listActivePlugins, 500)).toBe(true);
    expect(isOkStatus(ACTIONS.installPlugin, 202)).toBe(true);
  });
});
