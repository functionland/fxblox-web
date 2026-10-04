/**
 * Network drive — the Blox's Samba share (fula-ota `SharedFolder`) for non-technical users: the sign-in details
 * (from go-fula's owner-only `nas-credentials` action) plus a few plain steps for Windows, Mac, iPhone/iPad and
 * Android.
 *
 * The password exists only in this component's state: never in a store, IndexedDB, the URL, a toast (toast text
 * is mirrored to the console) or a log. It is cleared when the Blox changes, on retry and on unmount.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  FxCopyButton,
  FxEmptyState,
  FxFolderIcon,
  FxFoldableContent,
  FxLink,
  FxLoadingSpinner,
  FxTabs,
  FxText,
} from '@functionland/fx-ui';
import { CopyRow } from '@/components/main/CopyRow';
import { CurrentBloxIndicator } from '@/components/CurrentBloxIndicator';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { blockchain } from '@/lib/fula';
import type { NasCredentialsResponse } from '@/lib/fula/types';
import { osName } from '@/platform/deviceInfo';
import { openUrl } from '@/platform/linking';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import {
  NAS_DEVICES,
  buildNasAddresses,
  defaultNasDevice,
  isNetbiosName,
  resolveNasIp,
  type NasAddresses,
  type NasDevice,
  type NasIpSource,
} from './nasAddress';
import { nasErrorKind, nasErrorRetryable, type NasErrorKind } from './nasState';

const ISSUES_URL = 'https://github.com/functionland/fxblox-web/issues';
const SLOW_CONNECTING_MS = 30_000;
const SLOW_LOADING_MS = 10_000;
const K = 'settings.networkDrive';

type Result = { peer: string; data?: NasCredentialsResponse; error?: NasErrorKind };
type IpInfo = { peer: string; ip?: string; source?: NasIpSource };

const bold = <FxText as="strong" variant="bodySmallSemibold" color="content1" />;

/** One attention item (same look as the setup Requirements cards). */
function IssueCard({
  tone,
  title,
  body,
  children,
  testID,
}: {
  tone: 'warning' | 'error';
  title: string;
  body: string;
  children?: ReactNode;
  testID: string;
}) {
  return (
    <FxBox
      as="article"
      backgroundColor={tone === 'error' ? 'errorMuted' : 'warningMuted'}
      borderRadius="m"
      padding="16"
      gap="8"
      role={tone === 'error' ? 'alert' : 'status'}
      testID={testID}
    >
      <FxText as="h2" variant="bodySmallSemibold" color="content1">
        {title}
      </FxText>
      <FxText variant="bodySmallRegular" color="content2">
        {body}
      </FxText>
      {children}
    </FxBox>
  );
}

/** A value the user types somewhere else: monospace, wraps, with its own Copy button. */
function CopyChip({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  return (
    <FxBox
      flexDirection="row"
      alignItems="center"
      gap="8"
      marginTop="4"
      padding="8"
      borderRadius="s"
      backgroundColor="backgroundSecondary"
    >
      <FxText variant="bodySmallRegular" color="content1" className="min-w-0 flex-1 break-all font-mono">
        {value}
      </FxText>
      <FxCopyButton value={value} label={label} copiedLabel={t('main.common.copied')} />
    </FxBox>
  );
}

interface Step {
  key: string;
  chips?: { value: string; label: string }[];
}

function StepList({ steps, testID }: { steps: Step[]; testID?: string }) {
  return (
    <FxBox as="ol" className="m-0 list-decimal pl-6" gap="12" testID={testID}>
      {steps.map((s) => (
        <FxBox as="li" key={s.key} className="pl-1">
          <FxText variant="bodySmallRegular" color="content2">
            <Trans i18nKey={s.key} components={{ bold }} />
          </FxText>
          {s.chips?.map((c) => c.value && <CopyChip key={c.label} value={c.value} label={c.label} />)}
        </FxBox>
      ))}
    </FxBox>
  );
}

function FoldHeader({ children }: { children: ReactNode }) {
  return (
    <FxText variant="bodySmallSemibold" color="greenBase" paddingVertical="8">
      {children}
    </FxText>
  );
}

function stepsFor(device: NasDevice, a: NasAddresses, t: (k: string) => string): Step[] {
  const copyAddress = t(`${K}.details.copyAddress`);
  switch (device) {
    case 'windows':
      return [
        { key: `${K}.steps.windows.1` },
        { key: `${K}.steps.windows.2`, chips: [{ value: a.windows, label: copyAddress }] },
        { key: `${K}.steps.windows.3` },
        { key: `${K}.steps.windows.4` },
      ];
    case 'mac':
      return [
        { key: `${K}.steps.mac.1` },
        { key: `${K}.steps.mac.2`, chips: [{ value: a.smb, label: copyAddress }] },
        { key: `${K}.steps.mac.3` },
        { key: `${K}.steps.mac.4` },
      ];
    case 'ios':
      return [
        { key: `${K}.steps.ios.1` },
        { key: `${K}.steps.ios.2` },
        { key: `${K}.steps.ios.3`, chips: [{ value: a.smb, label: copyAddress }] },
        { key: `${K}.steps.ios.4` },
        { key: `${K}.steps.ios.5` },
      ];
    case 'android':
      return [
        { key: `${K}.steps.android.1` },
        { key: `${K}.steps.android.2` },
        {
          key: `${K}.steps.android.3`,
          // Some apps ask for server + folder, others for one smb:// address.
          chips: [
            { value: a.server, label: t(`${K}.details.copyServer`) },
            { value: a.share, label: t(`${K}.details.copyShare`) },
            { value: a.smb, label: copyAddress },
          ],
        },
        { key: `${K}.steps.android.4` },
      ];
  }
}

function DevicePanel({
  device,
  data,
  addresses,
  ipSource,
  bloxCount,
  isRealMac,
}: {
  device: NasDevice;
  data: NasCredentialsResponse;
  addresses: NasAddresses;
  ipSource: NasIpSource | undefined;
  bloxCount: number;
  isRealMac: boolean;
}) {
  const { t } = useTranslation();
  const address = device === 'windows' ? addresses.windows : addresses.smb;
  const altAddress = device === 'windows' ? addresses.windowsAlt : addresses.smbAlt;
  const needsIpHint = device !== 'windows' && !addresses.ipKnown;
  const copied = t('main.common.copied');

  return (
    <FxBox gap="20" marginTop="16">
      <FxCard testID="nas-details">
        <FxCard.Title as="h3" variant="bodyMediumRegular" marginBottom="8">
          {t(`${K}.details.title`)}
        </FxCard.Title>
        {device === 'android' ? (
          <>
            {addresses.server && (
              <CopyRow
                label={t(`${K}.details.server`)}
                value={addresses.server}
                truncate="none"
                copyLabel={t(`${K}.details.copyServer`)}
                copiedLabel={copied}
                testID="nas-server"
              />
            )}
            <CopyRow
              label={t(`${K}.details.share`)}
              value={addresses.share}
              truncate="none"
              copyLabel={t(`${K}.details.copyShare`)}
              copiedLabel={copied}
              testID="nas-share"
            />
          </>
        ) : (
          address && (
            <CopyRow
              label={t(`${K}.details.address`)}
              value={address}
              truncate="none"
              copyLabel={t(`${K}.details.copyAddress`)}
              copiedLabel={copied}
              testID="nas-address"
            />
          )
        )}
        <CopyRow
          label={t(`${K}.details.username`)}
          value={data.username}
          truncate="none"
          copyLabel={t(`${K}.details.copyUsername`)}
          copiedLabel={copied}
          testID="nas-username"
        />
        <CopyRow
          label={t(`${K}.details.password`)}
          value={data.password}
          truncate="none"
          secret
          copyLabel={t(`${K}.details.copyPassword`)}
          copiedLabel={copied}
          revealLabel={t(`${K}.details.showPassword`)}
          hideLabel={t(`${K}.details.hidePassword`)}
          testID="nas-password"
        />
        <FxText variant="bodyXSRegular" color="content3" marginTop="8">
          {t(`${K}.details.passwordHint`)}
        </FxText>
        {needsIpHint && (
          <FxText variant="bodyXSRegular" color="content3" marginTop="4" testID="nas-no-ip-hint">
            {t(`${K}.details.noIpHint`)}
          </FxText>
        )}
      </FxCard>

      {device === 'android' && (
        <FxText variant="bodySmallRegular" color="content2">
          {t(`${K}.steps.android.intro`)}
        </FxText>
      )}
      <StepList steps={stepsFor(device, addresses, t)} testID={`nas-steps-${device}`} />

      {device === 'mac' && isRealMac && addresses.smb && (
        <FxBox gap="4">
          <FxButton
            variant="inverted"
            alignSelf="flex-start"
            onPress={() => openUrl(addresses.smb)}
            testID="nas-open-finder"
          >
            {t(`${K}.steps.mac.openFinder`)}
          </FxButton>
          <FxText variant="bodyXSRegular" color="content3">
            {t(`${K}.steps.mac.openFinderHint`)}
          </FxText>
        </FxBox>
      )}

      {device === 'windows' && (
        <FxFoldableContent header={<FoldHeader>{t(`${K}.steps.windowsDrive.title`)}</FoldHeader>} testID="nas-windows-drive">
          <FxBox paddingTop="8">
            <StepList
              steps={[
                { key: `${K}.steps.windowsDrive.1` },
                {
                  key: `${K}.steps.windowsDrive.2`,
                  chips: [{ value: addresses.windows, label: t(`${K}.details.copyAddress`) }],
                },
                { key: `${K}.steps.windowsDrive.3` },
              ]}
            />
          </FxBox>
        </FxFoldableContent>
      )}

      <FxFoldableContent header={<FoldHeader>{t(`${K}.help.title`)}</FoldHeader>} testID="nas-help">
        <FxBox as="ul" className="m-0 list-disc pl-6" gap="12" paddingTop="8">
          <HelpItem k={`${K}.help.sameWifi`} />
          <HelpItem k={`${K}.help.online`} />
          {altAddress && <HelpItem k={`${K}.help.otherAddress`} chip={{ value: altAddress, label: t(`${K}.details.copyAddress`) }} />}
          <HelpItem k={`${K}.help.afterUpdate`} />
          <HelpItem k={`${K}.help.password`} />
          {device === 'windows' && isNetbiosName(addresses.name) && (
            <HelpItem
              k={`${K}.help.windowsUser`}
              chip={{ value: `${addresses.name.toUpperCase()}\\${data.username}`, label: t(`${K}.details.copyUsername`) }}
            />
          )}
          {device === 'windows' && <HelpItem k={`${K}.help.windowsOtherAccount`} />}
          {device === 'windows' && <HelpItem k={`${K}.help.windows1219`} />}
          {!addresses.ipKnown && (
            <HelpItem
              k={`${K}.help.findIp`}
              values={{ name: addresses.name ?? 'fxblox', share: addresses.share }}
            />
          )}
          {addresses.ipKnown && ipSource !== 'fresh' && <HelpItem k={`${K}.help.ipMayChange`} />}
          {bloxCount > 1 && <HelpItem k={`${K}.help.twoBlox`} />}
        </FxBox>
        <FxLink href={ISSUES_URL} target="_blank" rel="noopener noreferrer" alignSelf="flex-start" marginTop="8">
          {t(`${K}.help.stillStuck`)}
        </FxLink>
      </FxFoldableContent>

      <FxText variant="bodyXSRegular" color="content3">
        {t(`${K}.safety`)}
      </FxText>
    </FxBox>
  );
}

function HelpItem({
  k,
  chip,
  values,
}: {
  k: string;
  chip?: { value: string; label: string };
  values?: Record<string, string>;
}) {
  return (
    <FxBox as="li">
      <FxText variant="bodySmallRegular" color="content2">
        <Trans i18nKey={k} values={values} components={{ bold }} />
      </FxText>
      {chip && <CopyChip value={chip.value} label={chip.label} />}
    </FxBox>
  );
}

function Waiting({ text, slowText, slow }: { text: string; slowText: string; slow: boolean }) {
  return (
    <FxBox gap="8" role="status" testID="nas-waiting">
      <FxBox flexDirection="row" alignItems="center" gap="12">
        <FxLoadingSpinner width={20} height={20} />
        <FxText variant="bodySmallRegular" color="content2">
          {text}
        </FxText>
      </FxBox>
      {slow && (
        <FxText variant="bodyXSRegular" color="content3">
          {slowText}
        </FxText>
      )}
    </FxBox>
  );
}

const ERROR_TONE: Record<NasErrorKind, 'warning' | 'error'> = {
  notProvisioned: 'warning',
  needsUpdate: 'warning',
  ownerOnly: 'warning',
  busy: 'warning',
  reconnect: 'error',
  offline: 'error',
  generic: 'error',
};

export default function NetworkDrive() {
  const { t } = useTranslation();
  const currentBloxPeerId = useBloxsStore((s) => s.currentBloxPeerId);
  const bloxCount = useBloxsStore((s) => Object.keys(s.bloxs).length);
  const fulaIsReady = useUserProfileStore((s) => s.fulaIsReady);
  const fulaReadyForPeerId = useUserProfileStore((s) => s.fulaReadyForPeerId);
  const appPeerId = useUserProfileStore((s) => s.appPeerId);
  const ready = fulaIsReady && !!currentBloxPeerId && fulaReadyForPeerId === currentBloxPeerId;

  const [device, setDevice] = useState<NasDevice>(() => defaultNasDevice(osName()));
  const isRealMac = useMemo(() => osName() === 'macos' && defaultNasDevice('macos') === 'mac', []);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [slowFor, setSlowFor] = useState<string | null>(null);

  // Credentials: fetched only once the client is connected to THIS Blox; a late answer for another Blox, an
  // earlier attempt or an unmounted screen is dropped.
  useEffect(() => {
    if (!ready || !currentBloxPeerId) return;
    const peer = currentBloxPeerId;
    let alive = true;
    blockchain.nasCredentials(peer).then(
      (data) => {
        if (alive) setResult({ peer, data });
      },
      (e: unknown) => {
        if (!alive) return;
        const authorizer = useBloxsStore.getState().bloxsPropertyInfo?.[peer]?.authorizer;
        const me = useUserProfileStore.getState().appPeerId;
        setResult({ peer, error: nasErrorKind(e, { authorizer, appPeerId: me }) });
      },
    );
    return () => {
      alive = false;
      setResult(null);
    };
  }, [ready, currentBloxPeerId, attempt]);

  // The Blox's LAN IP, from what the app already knows (no network scan).
  useEffect(() => {
    if (!currentBloxPeerId) return;
    const peer = currentBloxPeerId;
    let alive = true;
    void resolveNasIp(peer, appPeerId).then((r) => {
      if (alive) setIpInfo(r ? { peer, ip: r.ip, source: r.source } : { peer });
    });
    return () => {
      alive = false;
    };
  }, [currentBloxPeerId, appPeerId]);

  const current = result && result.peer === currentBloxPeerId ? result : null;
  const phase: 'noBlox' | 'connecting' | 'loading' | 'error' | 'ready' = !currentBloxPeerId
    ? 'noBlox'
    : !ready
      ? 'connecting'
      : !current
        ? 'loading'
        : current.error
          ? 'error'
          : 'ready';

  // "This is taking longer than usual" after a while in the same waiting phase.
  const waitKey = phase === 'connecting' || phase === 'loading' ? `${phase}:${currentBloxPeerId}:${attempt}` : null;
  useEffect(() => {
    if (!waitKey) return;
    const id = setTimeout(() => setSlowFor(waitKey), waitKey.startsWith('connecting') ? SLOW_CONNECTING_MS : SLOW_LOADING_MS);
    return () => clearTimeout(id);
  }, [waitKey]);
  const slow = waitKey !== null && slowFor === waitKey;

  const ip = ipInfo && ipInfo.peer === currentBloxPeerId ? ipInfo.ip : undefined;
  const ipSource = ipInfo && ipInfo.peer === currentBloxPeerId ? ipInfo.source : undefined;
  const data = current?.data;
  const addresses = useMemo(
    () => buildNasAddresses({ hostname: data?.hostname, share: data?.share, ip, bloxCount }),
    [data?.hostname, data?.share, ip, bloxCount],
  );

  let body: ReactNode;
  if (phase === 'noBlox') {
    body = <FxEmptyState icon={<FxFolderIcon />} title={t(`${K}.title`)} description={t(`${K}.state.noBlox`)} compact />;
  } else if (phase === 'connecting') {
    body = <Waiting text={t(`${K}.state.connecting`)} slowText={t(`${K}.state.slowConnecting`)} slow={slow} />;
  } else if (phase === 'loading') {
    body = <Waiting text={t(`${K}.state.loading`)} slowText={t(`${K}.state.slowLoading`)} slow={slow} />;
  } else if (phase === 'error' && current?.error) {
    const kind = current.error;
    body = (
      <IssueCard
        tone={ERROR_TONE[kind]}
        title={t(`${K}.errors.${kind}.title`)}
        body={t(`${K}.errors.${kind}.body`)}
        testID={`nas-error-${kind}`}
      >
        {nasErrorRetryable(kind) && (
          <FxButton
            variant="inverted"
            size="small"
            alignSelf="flex-start"
            onPress={() => setAttempt((a) => a + 1)}
            testID="nas-retry"
          >
            {kind === 'notProvisioned' || kind === 'needsUpdate' ? t(`${K}.state.checkAgain`) : t(`${K}.state.retry`)}
          </FxButton>
        )}
        {kind === 'generic' && (
          <FxLink href={ISSUES_URL} target="_blank" rel="noopener noreferrer" alignSelf="flex-start">
            {t(`${K}.help.stillStuck`)}
          </FxLink>
        )}
      </IssueCard>
    );
  } else if (data) {
    const idx = NAS_DEVICES.indexOf(device);
    body = (
      <FxBox gap="8">
        <FxText as="h2" variant="h400" color="content1">
          {t(`${K}.devicePicker`)}
        </FxText>
        <FxTabs
          items={NAS_DEVICES.map((d) => t(`${K}.devices.${d}`))}
          selectedIdx={idx}
          onSelect={(i) => setDevice(NAS_DEVICES[i] ?? 'windows')}
          aria-label={t(`${K}.devicePicker`)}
        >
          {NAS_DEVICES.map((d, i) => (
            <FxTabs.Panel key={d} index={i}>
              <DevicePanel
                device={d}
                data={data}
                addresses={addresses}
                ipSource={ipSource}
                bloxCount={bloxCount}
                isRealMac={isRealMac}
              />
            </FxTabs.Panel>
          ))}
        </FxTabs>
      </FxBox>
    );
  }

  return (
    <SettingsScreen title={t(`${K}.title`)} screen="network-drive">
      <FxBox marginTop="16" gap="16">
        {bloxCount > 1 && <CurrentBloxIndicator compact showConnectionStatus />}
        <FxBox gap="4">
          <FxText variant="bodyMediumRegular" color="content2">
            {t(`${K}.intro`)}
          </FxText>
          <FxText variant="bodySmallRegular" color="content3">
            {t(`${K}.sameNetwork`)}
          </FxText>
        </FxBox>
        {body}
      </FxBox>
    </SettingsScreen>
  );
}
