import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBleMockState,
  fakeSession,
  mockBluetoothModule,
  resetBleMockState,
} from '@/screens/InitialSetup/__tests__/bleMocks';

const ble = vi.hoisted(() => ({ state: null as ReturnType<typeof createBleMockState> | null }));

vi.mock('@/platform/bluetooth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/bluetooth')>();
  ble.state ??= createBleMockState();
  return mockBluetoothModule(actual, ble.state);
});

import { BleRegistry } from '@/platform/bluetooth';
import { createMemoryKvStore } from '@/platform/kvStore';
import { useBloxsStore } from '@/stores';
import { formatLogResponse, HINT_KEY } from '../BluetoothCommands';
import { renderSetupAt, resetStores } from '@/screens/InitialSetup/__tests__/renderSetup';

vi.mock('@/platform/kvStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/kvStore')>();
  const memory = actual.createMemoryKvStore();
  return { ...actual, kvStore: memory };
});

import { kvStore } from '@/platform/kvStore';

const LOGS = {
  docker: { fula_go: 'go log', ipfs_host: '' },
  system: {
    df: { df: 'DF', lsblk: 'LSBLK' },
    docker_ps: { containers: 'C', images: 'I' },
    ls: { '/uniondrive': 'files' },
    fula: 'fula status',
  },
};

describe('BluetoothCommands', () => {
  beforeEach(async () => {
    resetStores({ identity: true, appPeerId: 'app' });
    resetBleMockState(ble.state!);
    BleRegistry._resetForTests();
    await kvStore.clear();
    void createMemoryKvStore; // keep the import referenced (the mock builds its own store)
  });

  it('formats the log response like mobile', () => {
    const out = formatLogResponse(LOGS);
    expect(out).toContain(
      '=== Docker Logs ===\n\n## fula_go\ngo log\n\n## ipfs_host\nNo logs available',
    );
    expect(out).toContain('## df\n=== df -hT ===\nDF\n\n=== lsblk ===\nLSBLK');
    expect(out).toContain('=== Containers ===\nC\n\n=== Images ===\nI');
    expect(out).toContain('=== /uniondrive ===\nfiles');
    expect(out).toContain('## fula\nfula status');
  });

  it('shows the first-time hint once, connects on the explicit button, fetches the logs and runs a direct command', async () => {
    ble.state!.pick.mockResolvedValue(fakeSession());
    ble.state!.responses.logs = (command: string) =>
      command.includes('"exec"') ? { ok: true } : LOGS;
    const user = userEvent.setup();
    await renderSetupAt('/setup/bluetooth');
    expect(await screen.findByTestId('connect-hint')).toBeInTheDocument();
    expect(screen.getByText(/Click the plug icon in the top right corner/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByTestId('connect-hint')).toBeNull();
    expect(await kvStore.getItem(HINT_KEY)).toBe('true');

    await user.click(screen.getByTestId('ble-connect-main'));
    expect(await screen.findByText('Connected to Blox device')).toBeInTheDocument();
    const grid = await screen.findByTestId('command-grid');
    expect(within(grid).getAllByRole('button')).toHaveLength(9);
    expect(screen.getByTestId('ble-logs')).toHaveTextContent('=== Docker Logs ===');
    expect(ble.state!.written[0]).toBe(
      `logs ${JSON.stringify({ docker: ['fula_go', 'ipfs_host', 'ipfs_cluster'], system: ['df', 'fula', 'docker', 'uniondrive', 'docker_ps', 'ls'] })}`,
    );

    // A skipCode command: confirm → executed directly, then the logs are refreshed.
    await user.click(screen.getByTestId('command-wireguard/start'));
    const confirmDialog = await screen.findByTestId('fx-confirm');
    expect(confirmDialog).toHaveTextContent('Are you sure you want to execute SUPPORT ON?');
    await user.click(within(confirmDialog).getByRole('button', { name: 'Yes' }));
    await waitFor(() =>
      expect(ble.state!.written).toContain(`logs ${JSON.stringify({ exec: ['wireguard/start'] })}`),
    );
    expect(await screen.findByText('Command executed successfully')).toBeInTheDocument();
    expect(ble.state!.written.filter((c) => !c.includes('"exec"')).length).toBe(2);
  });

  it('code-gated commands need the support code; a wrong code is rejected, 1234 runs the command', async () => {
    ble.state!.pick.mockResolvedValue(fakeSession());
    ble.state!.responses.logs = (command: string) =>
      command.includes('"exec"') ? { ok: true } : LOGS;
    await kvStore.setItem(HINT_KEY, 'true');
    const user = userEvent.setup();
    await renderSetupAt('/setup/bluetooth');
    await screen.findByTestId('bluetooth-commands');
    expect(screen.queryByTestId('connect-hint')).toBeNull();
    await user.click(await screen.findByTestId('ble-connect'));
    await screen.findByTestId('command-grid');

    await user.click(screen.getByTestId('command-reset'));
    await user.click(
      within(await screen.findByTestId('fx-confirm')).getByRole('button', { name: 'Yes' }),
    );
    const dialog = await screen.findByTestId('code-dialog');
    await user.type(within(dialog).getByTestId('security-code'), '0000');
    await user.click(within(dialog).getByTestId('code-submit'));
    expect(await screen.findByText('Invalid Code')).toBeInTheDocument();
    expect(ble.state!.written.some((c) => c.includes('"reset"'))).toBe(false);

    await user.click(screen.getByTestId('command-reset'));
    await user.click(
      within(await screen.findByTestId('fx-confirm')).getByRole('button', { name: 'Yes' }),
    );
    const dialog2 = await screen.findByTestId('code-dialog');
    await user.type(within(dialog2).getByTestId('security-code'), '1234');
    await user.click(within(dialog2).getByTestId('code-submit'));
    await waitFor(() =>
      expect(ble.state!.written).toContain(`logs ${JSON.stringify({ exec: ['reset'] })}`),
    );
  });

  it('a failed connection toasts and keeps the connect prompt; Back returns to Settings when set up', async () => {
    ble.state!.pick.mockRejectedValue(new Error('GATT busy'));
    useBloxsStore.setState({ bloxs: { b1: { peerId: 'b1', name: 'B' } }, currentBloxPeerId: 'b1' });
    const user = userEvent.setup();
    const { router } = await renderSetupAt('/setup/bluetooth');
    await user.click(await screen.findByTestId('ble-connect-main'));
    expect(await screen.findByText('Connection failed')).toBeInTheDocument();
    expect(screen.getByText('GATT busy')).toBeInTheDocument();
    expect(screen.queryByTestId('command-grid')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
  });
});
