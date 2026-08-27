/**
 * Port of apps/box/src/screens/Settings/Bluetooth/BluetoothCommands.screen.tsx. Mounted at /settings/bluetooth
 * (AppShell) and /setup/bluetooth (SetupShell).
 *
 * Explicit "Connect" button (Chrome's chooser replaces the device-selection sheet) with the first-time hint
 * (flag `bluetooth_commands_hint_seen` in the KV store), the 9-command grid (`confirm()` per command, red for
 * the dangerous ones, the support code 1234 dialog for the code-gated ones, `skipCode` ones run directly), the
 * `logs {json}` fetch formatted by the verbatim `formatLogResponse` into an `FxCodeBlock` with copy / refresh.
 * The BLE session stays registered on unmount (other screens reuse it).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCodeBlock,
  FxDialog,
  FxIconButton,
  FxPageHeader,
  FxPlugIcon,
  FxRefreshIcon,
  FxSpinner,
  FxText,
  FxTextInput,
  useConfirm,
  useToast,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { readIsSetUp } from '@/app/setupState';
import { CurrentBloxIndicator } from '@/components/CurrentBloxIndicator';
import { currentBleSession, errorMessage, useBleConnect } from '@/components/setup/ble';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useLogger } from '@/hooks/useLogger';
import { ResponseAssembler } from '@/platform/bluetooth';
import { kvStore } from '@/platform/kvStore';
import type { Peripheral } from '@/utils/ble';

export const HINT_KEY = 'bluetooth_commands_hint_seen';
export const SECURITY_CODE = '1234';

export interface CommandButton {
  command: string;
  dangerous?: boolean;
  skipCode?: boolean;
}

export const COMMAND_BUTTONS: CommandButton[] = [
  { command: 'partition' },
  { command: 'cluster_delete', dangerous: true },
  { command: 'restart_fula' },
  { command: 'restart_uniondrive' },
  { command: 'hotspot' },
  { command: 'reset', dangerous: true },
  { command: 'wireguard/start', skipCode: true },
  { command: 'wireguard/stop', skipCode: true },
  { command: 'forceupdate', skipCode: true },
];

export const FULL_LOGS_PARAMS = {
  docker: ['fula_go', 'ipfs_host', 'ipfs_cluster'],
  system: ['df', 'fula', 'docker', 'uniondrive', 'docker_ps', 'ls'],
};

type LogResponse = {
  docker?: Record<string, unknown>;
  system?: Record<string, unknown>;
};

/** Verbatim mobile formatter. */
export function formatLogResponse(response: unknown): string {
  const res = (response ?? {}) as LogResponse;
  let formatted = '';

  formatted += '=== Docker Logs ===\n\n';
  for (const [container, logs] of Object.entries(res.docker ?? {})) {
    formatted += `## ${container}\n${(logs as string) || 'No logs available'}\n\n`;
  }

  formatted += '=== System Logs ===\n\n';
  for (const [command, output] of Object.entries(res.system ?? {})) {
    formatted += `## ${command}\n`;
    const out = output as Record<string, string> | string | undefined;
    if (command === 'df' && out && typeof out === 'object') {
      formatted += `=== df -hT ===\n${out.df}\n\n`;
      formatted += `=== lsblk ===\n${out.lsblk}\n\n`;
    } else if (command === 'docker_ps' && out && typeof out === 'object') {
      formatted += `=== Containers ===\n${out.containers}\n\n`;
      formatted += `=== Images ===\n${out.images}\n\n`;
    } else if (command === 'ls' && out && typeof out === 'object') {
      for (const [path, result] of Object.entries(out)) {
        formatted += `=== ${path} ===\n${result}\n\n`;
      }
    } else {
      formatted += `${(out as string) || 'No output available'}\n\n`;
    }
  }

  return formatted;
}

export default function BluetoothCommands() {
  const { t } = useTranslation();
  const { back } = useAppNavigate();
  const { queueToast } = useToast();
  const { confirm } = useConfirm();
  const logger = useLogger();
  const { connect, connecting: isConnecting } = useBleConnect();

  const [currentPeripheral, setCurrentPeripheral] = useState<Peripheral | null>(() => {
    const s = currentBleSession();
    return s ? { id: s.id, name: s.name, connected: true } : null;
  });
  const [runningCommand, setRunningCommand] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [log, setLog] = useState('');
  const [isCodeModalVisible, setIsCodeModalVisible] = useState(false);
  const [securityCode, setSecurityCode] = useState('');
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [showConnectHint, setShowConnectHint] = useState(false);
  const inFlight = useRef<ResponseAssembler | null>(null);

  // Show first-time connect hint
  useEffect(() => {
    let alive = true;
    void kvStore
      .getItem(HINT_KEY)
      .then((val) => {
        if (alive && !val) setShowConnectHint(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Abort an in-flight command on unmount (the BLE session itself stays registered for the other screens).
  useEffect(() => {
    return () => {
      inFlight.current?.cleanup();
      inFlight.current = null;
    };
  }, []);

  const dismissHint = () => {
    setShowConnectHint(false);
    void kvStore.setItem(HINT_KEY, 'true').catch(() => undefined);
  };

  const writeCommand = useCallback(async (command: string, peripheralId: string) => {
    const assembler = new ResponseAssembler();
    inFlight.current = assembler;
    try {
      return await assembler.writeToBLEAndWaitForResponse(command, peripheralId);
    } finally {
      if (inFlight.current === assembler) inFlight.current = null;
      assembler.cleanup();
    }
  }, []);

  const fetchFullLogs = useCallback(
    async (params: typeof FULL_LOGS_PARAMS, peripheral: Peripheral | null | undefined) => {
      try {
        setLoadingLogs(true);
        const target = peripheral?.id ? peripheral : currentPeripheral;
        if (target?.id) {
          const response = await writeCommand(`logs ${JSON.stringify(params)}`, target.id);
          if (response) setLog(formatLogResponse(response));
        }
      } catch (error) {
        logger.logError('fetchFullLogs', error);
        queueToast({
          type: 'error',
          title: t('setup.bluetoothCommands.logsFailed'),
          message: errorMessage(error),
        });
      } finally {
        setLoadingLogs(false);
      }
    },
    [currentPeripheral, writeCommand, logger, queueToast, t],
  );

  const runExec = async (command: string) => {
    try {
      setLoadingLogs(true);
      if (currentPeripheral?.id) {
        const response = await writeCommand(
          `logs ${JSON.stringify({ exec: [command] })}`,
          currentPeripheral.id,
        );
        if (response) {
          queueToast({ type: 'success', title: t('setup.bluetoothCommands.commandExecuted') });
          await fetchFullLogs(FULL_LOGS_PARAMS, currentPeripheral);
        }
      }
    } catch (error) {
      logger.logError('executeCommand', error);
      queueToast({
        type: 'error',
        title: t('setup.bluetoothCommands.commandFailed'),
        message: errorMessage(error),
      });
    } finally {
      setLoadingLogs(false);
    }
  };

  const executeCommand = (command: string) => {
    setPendingCommand(command);
    setSecurityCode('');
    setIsCodeModalVisible(true);
  };

  const executeCommandDirectly = (command: string) => void runExec(command);

  const handleCodeSubmit = async () => {
    setIsCodeModalVisible(false);
    const command = pendingCommand;
    setPendingCommand(null);
    if (securityCode !== SECURITY_CODE || !command) {
      queueToast({
        type: 'error',
        title: t('setup.bluetoothCommands.invalidCode'),
        message: t('setup.bluetoothCommands.invalidCodeMessage'),
      });
      return;
    }
    await runExec(command);
  };

  const connectViaBLE = async () => {
    console.log('BluetoothCommands: Starting BLE connection...');
    setRunningCommand(true);
    try {
      const { session, failure, error } = await connect();
      if (!session) {
        if (failure === 'cancelled') return;
        logger.logError('connectViaBLE', error);
        queueToast({
          type: 'error',
          title: t('setup.bluetoothCommands.connectionFailed'),
          message: errorMessage(error) || t('setup.bluetoothCommands.unknownError'),
        });
        return;
      }
      queueToast({ type: 'success', title: t('setup.bluetoothCommands.connected') });
      const peripheral: Peripheral = { id: session.id, name: session.name, connected: true };
      setCurrentPeripheral(peripheral);
      console.log('BluetoothCommands: Successfully connected, fetching logs...');
      await fetchFullLogs(FULL_LOGS_PARAMS, peripheral);
    } finally {
      setRunningCommand(false);
    }
  };

  const onCommandPress = async (btn: CommandButton) => {
    const label = t(`setup.bluetoothCommands.commands.${btn.command}`);
    const ok = await confirm({
      title: t('setup.bluetoothCommands.confirmTitle'),
      message: t('setup.bluetoothCommands.confirmMessage', { label }),
      confirmText: t('setup.bluetoothCommands.yes'),
      cancelText: t('setup.bluetoothCommands.cancel'),
      destructive: btn.dangerous,
    });
    if (!ok) return;
    if (btn.skipCode) executeCommandDirectly(btn.command);
    else executeCommand(btn.command);
  };

  const goBack = () => back(readIsSetUp() ? paths.settings.root : paths.setup.linkPassword);
  const connectDisabled = runningCommand || isConnecting;

  return (
    <FxBox
      as="section"
      data-screen="bluetooth-commands"
      testID="bluetooth-commands"
      className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-5"
    >
      <FxPageHeader
        title={t('setup.bluetoothCommands.title')}
        onBack={goBack}
        backLabel={t('shell.back')}
        actions={
          <FxBox position="relative">
            <FxIconButton
              aria-label={t('setup.bluetoothCommands.connect')}
              icon={<FxPlugIcon />}
              color="greenBase"
              variant={showConnectHint ? 'inverted' : 'ghost'}
              loading={isConnecting}
              disabled={connectDisabled}
              onPress={() => {
                if (showConnectHint) dismissHint();
                if (!connectDisabled) void connectViaBLE();
              }}
              testID="ble-connect"
            />
            {showConnectHint && (
              <FxBox
                role="note"
                position="absolute"
                top={48}
                right={0}
                width={220}
                zIndex={10}
                padding="12"
                borderRadius="m"
                backgroundColor="content1"
                gap="8"
                testID="connect-hint"
              >
                <FxText variant="bodySmallRegular" color="backgroundPrimary">
                  {t('setup.bluetoothCommands.hint')}
                </FxText>
                <FxButton size="small" onPress={dismissHint}>
                  {t('setup.bluetoothCommands.dismissHint')}
                </FxButton>
              </FxBox>
            )}
          </FxBox>
        }
      />
      <FxBox marginBottom="16">
        <CurrentBloxIndicator compact showConnectionStatus />
      </FxBox>

      {!currentPeripheral?.id ? (
        <FxBox flex={1} justifyContent="center" alignItems="center" gap="16" paddingVertical="24">
          {isConnecting ? (
            <FxBox flexDirection="row" alignItems="center" gap="8" role="status">
              <FxText variant="bodyMediumRegular">{t('setup.bluetoothCommands.connecting')}</FxText>
              <FxSpinner label={null} />
            </FxBox>
          ) : (
            <>
              <FxText variant="bodyMediumRegular" textAlign="center">
                {t('setup.bluetoothCommands.notConnected')}
              </FxText>
              <FxButton
                iconLeft={<FxPlugIcon />}
                disabled={connectDisabled}
                onPress={() => {
                  if (showConnectHint) dismissHint();
                  void connectViaBLE();
                }}
                testID="ble-connect-main"
              >
                {t('setup.bluetoothCommands.connect')}
              </FxButton>
            </>
          )}
        </FxBox>
      ) : (
        <FxBox gap="16">
          <div className="grid grid-cols-3 gap-2" data-testid="command-grid">
            {COMMAND_BUTTONS.map((btn) => (
              <FxButton
                key={btn.command}
                variant={btn.dangerous ? 'destructive' : 'defaults'}
                size="large"
                disabled={loadingLogs}
                onPress={() => void onCommandPress(btn)}
                testID={`command-${btn.command}`}
              >
                {t(`setup.bluetoothCommands.commands.${btn.command}`)}
              </FxButton>
            ))}
          </div>
          <FxBox flexDirection="row" alignItems="center" justifyContent="space-between" gap="8">
            <FxText variant="bodySmallRegular" color="content2" flex={1}>
              {t('setup.bluetoothCommands.logsTitle')}
            </FxText>
            {loadingLogs ? (
              <FxSpinner label={t('setup.common.loading')} />
            ) : (
              <FxIconButton
                aria-label={t('setup.bluetoothCommands.refreshLogs')}
                icon={<FxRefreshIcon />}
                color="content3"
                onPress={() => void fetchFullLogs(FULL_LOGS_PARAMS, undefined)}
                testID="refresh-logs"
              />
            )}
          </FxBox>
          <FxCodeBlock
            code={log || t('setup.bluetoothCommands.noLogs')}
            language="log"
            maxHeight={360}
            wrap
            testID="ble-logs"
          />
        </FxBox>
      )}

      <FxDialog
        open={isCodeModalVisible}
        onOpenChange={(open) => {
          setIsCodeModalVisible(open);
          if (!open) setPendingCommand(null);
        }}
        title={t('setup.bluetoothCommands.codeTitle')}
        description={t('setup.bluetoothCommands.codePrompt')}
        size="sm"
        testID="code-dialog"
        footer={
          <>
            <FxButton variant="inverted" onPress={() => setIsCodeModalVisible(false)}>
              {t('setup.bluetoothCommands.cancel')}
            </FxButton>
            <FxButton
              onPress={() => void handleCodeSubmit()}
              disabled={securityCode.length !== 4}
              testID="code-submit"
            >
              {t('setup.bluetoothCommands.submit')}
            </FxButton>
          </>
        }
      >
        <FxTextInput
          secureTextEntry
          value={securityCode}
          onChangeText={setSecurityCode}
          keyboardType="numeric"
          maxLength={4}
          autoFocus
          aria-label={t('setup.bluetoothCommands.codePrompt')}
          onSubmitEditing={() => {
            if (securityCode.length === 4) void handleCodeSubmit();
          }}
          testID="security-code"
        />
      </FxDialog>
    </FxBox>
  );
}
