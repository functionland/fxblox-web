/* Small demos for every P0/P1 component. The app mounts `<FxGallery />` (or iterates `galleryEntries`)
   at /gallery (DEV / VITE_ENABLE_GALLERY). Keep demos tiny — they double as a Playwright visual smoke page. */
import { useRef, useState, type ComponentType } from 'react';
import { FxAvatar } from '../components/avatar/FxAvatar.js';
import { FxBreadcrumbs } from '../components/breadcrumbs/FxBreadcrumbs.js';
import { FxButton } from '../components/button/FxButton.js';
import { FxButtonGroup } from '../components/button-group/FxButtonGroup.js';
import { FxCard } from '../components/card/FxCard.js';
import { FxCodeBlock } from '../components/code-block/FxCodeBlock.js';
import { FxCopyButton } from '../components/copy-button/FxCopyButton.js';
import { FxDropdown } from '../components/dropdown/FxDropdown.js';
import { FxEmptyState } from '../components/empty-state/FxEmptyState.js';
import { FxError, FxWarning } from '../components/error/FxError.js';
import { FxFile } from '../components/file/FxFile.js';
import { FxFoldableContent } from '../components/foldable-content/FxFoldableContent.js';
import { FxHeader } from '../components/header/FxHeader.js';
import { FxIconButton } from '../components/icon-button/FxIconButton.js';
import { FxTextArea } from '../components/input/FxTextArea.js';
import { FxTextInput } from '../components/input/FxTextInput.js';
import { FxLedDot } from '../components/led/FxLedDot.js';
import { FxLedSequence } from '../components/led/FxLedSequence.js';
import { FxTower } from '../components/led/FxTower.js';
import { FxLineChart } from '../components/line-chart/FxLineChart.js';
import { FxLink } from '../components/link/FxLink.js';
import { FxLoadingSpinner, FxSpinner } from '../components/loading-spinner/FxLoadingSpinner.js';
import { FxPageHeader } from '../components/page-header/FxPageHeader.js';
import { FxPicker, FxPickerItem } from '../components/picker/FxPicker.js';
import { FxProgressBar } from '../components/progress-bar/FxProgressBar.js';
import { FxRadioButton, FxRadioButtonWithLabel } from '../components/radio-button/index.js';
import { FxListSkeleton, FxSkeleton } from '../components/skeleton/FxSkeleton.js';
import { FxSlider } from '../components/slider/FxSlider.js';
import { FxStatusDot } from '../components/status-dot/FxStatusDot.js';
import { FxSwitch } from '../components/switch/FxSwitch.js';
import { FxTable } from '../components/table/FxTable.js';
import { FxTabs } from '../components/tabs/FxTabs.js';
import { FxTag } from '../components/tag/FxTag.js';
import { FxTooltip } from '../components/tooltip/FxTooltip.js';
import { BloxIcon } from '../icons/generated/BloxIcon.js';
import { FxCheckIcon } from '../icons/generated/FxCheckIcon.js';
import { FxPlusIcon } from '../icons/generated/FxPlusIcon.js';
import { FxRefreshIcon } from '../icons/generated/FxRefreshIcon.js';
import { FxSearchIcon } from '../icons/generated/FxSearchIcon.js';
import { FxTrashIcon } from '../icons/generated/FxTrashIcon.js';
import * as generatedIcons from '../icons/generated/index.js';
import { FxConfirmProvider, useConfirm } from '../overlays/confirm/FxConfirmProvider.js';
import { FxDialog } from '../overlays/dialog/FxDialog.js';
import { FxSheet, type FxSheetMethods } from '../overlays/sheet/FxSheet.js';
import { useFxSheet } from '../overlays/sheet/FxSheetContext.js';
import { ToastProvider } from '../overlays/toast/context/ToastProvider.js';
import useToast from '../overlays/toast/hooks/useToast.js';
import { FxBox } from '../primitives/FxBox.js';
import { FxHorizontalRule } from '../primitives/FxRule.js';
import { FxText } from '../primitives/FxText.js';
import { textVariants, type TextVariant } from '../theme/tokens.js';

export interface GalleryEntry {
  id: string;
  title: string;
  Component: ComponentType;
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <FxBox flexDirection="row" flexWrap="wrap" alignItems="center" gap="12">
    {children}
  </FxBox>
);

function TextDemo() {
  return (
    <FxBox gap="4">
      {(Object.keys(textVariants) as TextVariant[]).map((v) => (
        <FxText key={v} variant={v}>
          {v} — The quick brown fox
        </FxText>
      ))}
      <FxText numberOfLines={1} color="content3">
        numberOfLines=1: {'a very long line '.repeat(20)}
      </FxText>
    </FxBox>
  );
}

function ButtonDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <FxBox gap="12">
      <Row>
        <FxButton>Default</FxButton>
        <FxButton variant="inverted">Inverted</FxButton>
        <FxButton variant="pressed">Pressed</FxButton>
        <FxButton disabled>Disabled</FxButton>
        <FxButton variant="destructive">Destructive</FxButton>
      </Row>
      <Row>
        <FxButton size="small">Small</FxButton>
        <FxButton size="large">Large</FxButton>
        <FxButton iconLeft={<FxPlusIcon />}>Icon left</FxButton>
        <FxButton iconRight={<FxRefreshIcon />}>Icon right</FxButton>
        <FxButton icon={<FxPlusIcon />} width={40} aria-label="Add" />
        <FxButton loading={loading} onPress={() => setLoading((l) => !l)}>
          {loading ? 'Loading' : 'Click to load'}
        </FxButton>
      </Row>
    </FxBox>
  );
}

function IconButtonDemo() {
  return (
    <Row>
      <FxIconButton aria-label="Search" icon={<FxSearchIcon />} />
      <FxIconButton aria-label="Add" icon={<FxPlusIcon />} variant="filled" />
      <FxIconButton aria-label="Refresh" icon={<FxRefreshIcon />} variant="inverted" />
      <FxIconButton aria-label="Delete" icon={<FxTrashIcon />} variant="destructive" />
      <FxIconButton aria-label="Loading" icon={<FxRefreshIcon />} loading />
      <FxIconButton aria-label="Disabled" icon={<FxSearchIcon />} disabled />
    </Row>
  );
}

function CardDemo() {
  return (
    <FxBox gap="12">
      <FxCard>
        <FxCard.Title>Static card</FxCard.Title>
        <FxCard.Row marginTop="12">
          <FxCard.Row.Title>Free space</FxCard.Row.Title>
          <FxCard.Row.Data>412.5 GB</FxCard.Row.Data>
        </FxCard.Row>
        <FxCard.Row>
          <FxCard.Row.Title>Peers</FxCard.Row.Title>
          <FxCard.Row.Data>12</FxCard.Row.Data>
        </FxCard.Row>
      </FxCard>
      <FxCard onPress={() => alert('card pressed')} onLongPress={() => alert('long press')}>
        <FxCard.Title>Pressable card (long press too)</FxCard.Title>
      </FxCard>
    </FxBox>
  );
}

function TagDemo() {
  return (
    <Row>
      <FxTag>Authorized</FxTag>
      <FxTag iconLeft={<FxCheckIcon />}>Connected</FxTag>
      <FxTag iconRight={<FxPlusIcon />} backgroundColor="greenBackground">
        New
      </FxTag>
    </Row>
  );
}

function InputDemo() {
  const [value, setValue] = useState('');
  return (
    <FxBox gap="12" maxWidth={420}>
      <FxTextInput
        caption="Blox name"
        placeholder="My Blox"
        value={value}
        onChangeText={setValue}
      />
      <FxTextInput caption="Password" secureTextEntry placeholder="••••••" />
      <FxTextInput
        caption="Peer id"
        mono
        defaultValue="12D3KooWQYhTNQdmr3ArTeUHRYzFg94BKyTkoWBDWez9kSCVe2Xo"
      />
      <FxTextInput caption="With error" error errorMessage="This field is required" />
      <FxTextInput caption="Disabled" disabled defaultValue="read only" />
      <FxTextArea caption="Notes" placeholder="Multiline…" />
    </FxBox>
  );
}

function RadioDemo() {
  const [single, setSingle] = useState<string | number>('skale');
  const [multi, setMulti] = useState<(string | number)[]>(['terms']);
  return (
    <FxBox gap="16">
      <FxRadioButton.Group value={single} onValueChange={setSingle} aria-label="Chain">
        <FxRadioButtonWithLabel value="skale" label="SKALE" />
        <FxRadioButtonWithLabel value="base" label="Base" />
        <FxRadioButtonWithLabel value="other" label="Disabled" disabled />
      </FxRadioButton.Group>
      <FxRadioButton.Group value={multi} onValueChange={setMulti} aria-label="Consent">
        <FxRadioButtonWithLabel value="terms" label="I accept the terms" />
        <FxRadioButtonWithLabel value="privacy" label="I read the privacy policy" />
      </FxRadioButton.Group>
    </FxBox>
  );
}

function SwitchDemo() {
  const [on, setOn] = useState(true);
  return (
    <Row>
      <FxSwitch value={on} onValueChange={setOn} aria-label="Toggle" />
      <FxSwitch value={false} disabled aria-label="Off disabled" />
      <FxSwitch value disabled aria-label="On disabled" />
    </Row>
  );
}

function DropdownDemo() {
  const [v, setV] = useState<string | number>(8453);
  const options = [
    { label: 'SKALE Europa', value: 2046399126 },
    { label: 'Base', value: 8453 },
    { label: 'Disabled option', value: 0, disabled: true },
  ];
  return (
    <FxBox gap="12" maxWidth={420}>
      <FxDropdown
        caption="Chain"
        options={options}
        selectedValue={v}
        onValueChange={(val) => setV(val)}
      />
      <FxDropdown caption="Error" options={options} selectedValue={v} error />
      <FxDropdown caption="Disabled" options={options} selectedValue={v} disabled />
    </FxBox>
  );
}

function HeaderDemo() {
  const [isList, setIsList] = useState(true);
  const [asc, setAsc] = useState(true);
  return (
    <FxBox gap="12">
      <FxHeader
        title="Devices"
        isList={isList}
        setIsList={setIsList}
        onAddPress={() => alert('add')}
      />
      <FxHeader orderBy="Name" isOrderAscending={asc} setIsOrderByAscending={setAsc} />
    </FxBox>
  );
}

function ProgressDemo() {
  return (
    <FxBox gap="12">
      <FxProgressBar progress={20} />
      <FxProgressBar progress={60} height={8} />
      <FxProgressBar progress={3} total={5} width={200} />
    </FxBox>
  );
}

function SpinnerDemo() {
  return (
    <Row>
      <FxLoadingSpinner />
      <FxSpinner size="large" />
      <FxSpinner size={48} color="secondary" />
    </Row>
  );
}

function ErrorDemo() {
  return (
    <FxBox>
      <FxError error="Something went wrong" />
      <FxWarning error="Blox firmware is out of date" />
    </FxBox>
  );
}

function AvatarDemo() {
  const src = 'https://avatars.githubusercontent.com/u/68470222?s=200';
  return (
    <Row>
      <FxAvatar source={src} size="small" alt="Small" />
      <FxAvatar source={src} size="medium" icon="selected" alt="Selected" />
      <FxAvatar source={src} size="large" icon="edit" onPress={() => alert('edit')} alt="Edit" />
      <FxAvatar source="" size="xl" fallback="FX" alt="Fallback" />
    </Row>
  );
}

function SheetDemo() {
  const ref = useRef<FxSheetMethods>(null);
  const [open, setOpen] = useState(false);
  const Inner = () => {
    const { close } = useFxSheet();
    return <FxButton onPress={close}>Close from inside</FxButton>;
  };
  return (
    <Row>
      <FxButton onPress={() => ref.current?.present()}>Imperative sheet</FxButton>
      <FxSheet ref={ref} title="Blox info" onDismiss={() => console.log('dismissed')}>
        <FxText>Bottom drawer below 900px, dialog above.</FxText>
        <FxBox marginTop="12">
          <Inner />
        </FxBox>
      </FxSheet>
      <FxButton variant="inverted" onPress={() => setOpen(true)}>
        Controlled side sheet
      </FxButton>
      <FxSheet open={open} onOpenChange={setOpen} title="Connection options" desktopMode="side">
        <FxText>Side panel on desktop.</FxText>
      </FxSheet>
    </Row>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FxButton onPress={() => setOpen(true)}>Open dialog</FxButton>
      <FxDialog
        open={open}
        onOpenChange={setOpen}
        title="Skip code"
        description="Enter the 6-digit code shown on the Blox."
        footer={
          <>
            <FxButton variant="inverted" onPress={() => setOpen(false)}>
              Cancel
            </FxButton>
            <FxButton onPress={() => setOpen(false)}>Continue</FxButton>
          </>
        }
      >
        <FxTextInput caption="Code" mono inputMode="numeric" />
      </FxDialog>
    </>
  );
}

function ConfirmButtons() {
  const { confirm, alert: fxAlert, choose } = useConfirm();
  const [last, setLast] = useState<string>('—');
  return (
    <FxBox gap="8">
      <Row>
        <FxButton
          onPress={async () =>
            setLast(
              String(await confirm({ title: 'Reboot Blox?', message: 'It takes about a minute.' })),
            )
          }
        >
          confirm()
        </FxButton>
        <FxButton
          variant="destructive"
          onPress={async () =>
            setLast(
              String(
                await confirm({
                  title: 'Log out?',
                  message: 'Local data is wiped.',
                  destructive: true,
                  confirmText: 'Log out',
                }),
              ),
            )
          }
        >
          destructive confirm()
        </FxButton>
        <FxButton
          variant="inverted"
          onPress={async () => {
            await fxAlert({ title: 'Done', message: 'Saved.' });
            setLast('alert closed');
          }}
        >
          alert()
        </FxButton>
        <FxButton
          variant="inverted"
          onPress={async () =>
            setLast(
              String(
                await choose({
                  title: 'Pool',
                  message: 'Choose an action',
                  options: [
                    { label: 'Join', value: 'join' },
                    { label: 'Leave', value: 'leave', destructive: true },
                  ],
                }),
              ),
            )
          }
        >
          choose()
        </FxButton>
      </Row>
      <FxText color="content3">last result: {last}</FxText>
    </FxBox>
  );
}

function ConfirmDemo() {
  return (
    <FxConfirmProvider>
      <ConfirmButtons />
    </FxConfirmProvider>
  );
}

function ToastButtons() {
  const { showToast, queueToast, hideToast, clearToastQueue } = useToast();
  return (
    <Row>
      <FxButton
        onPress={() =>
          queueToast({
            type: 'success',
            title: 'Saved',
            message: 'Wi-Fi credentials stored on the Blox.',
          })
        }
      >
        queue success
      </FxButton>
      <FxButton
        onPress={() =>
          queueToast({ type: 'error', title: 'Failed', message: 'Could not reach the Blox.' })
        }
      >
        queue error
      </FxButton>
      <FxButton onPress={() => showToast({ type: 'warning', title: 'Jumped the queue' })}>
        show warning
      </FxButton>
      <FxButton
        variant="inverted"
        onPress={() =>
          queueToast({
            type: 'info',
            title: 'Info',
            message: 'Tap to dismiss',
            onPress: () => undefined,
          })
        }
      >
        queue info
      </FxButton>
      <FxButton variant="inverted" onPress={hideToast}>
        hide
      </FxButton>
      <FxButton variant="inverted" onPress={clearToastQueue}>
        clear
      </FxButton>
    </Row>
  );
}

function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}

function CodeBlockDemo() {
  return (
    <FxCodeBlock
      language="json"
      code={JSON.stringify(
        {
          peer_id: '12D3KooWQYhTNQdmr3ArTeUHRYzFg94BKyTkoWBDWez9kSCVe2Xo',
          free: 412.5,
          used_percentage: 12.4,
        },
        null,
        2,
      )}
    />
  );
}

function CopyDemo() {
  return (
    <Row>
      <FxText variant="bodySmallRegular" fontFamily="var(--fx-font-mono)">
        12D3KooW…e2Xo
      </FxText>
      <FxCopyButton value="12D3KooWQYhTNQdmr3ArTeUHRYzFg94BKyTkoWBDWez9kSCVe2Xo" />
    </Row>
  );
}

function StatusDotDemo() {
  return (
    <Row>
      {(['connected', 'checking', 'disconnected', 'warning', 'unknown'] as const).map((s) => (
        <FxBox key={s} flexDirection="row" alignItems="center" gap="4">
          <FxStatusDot status={s} label={null} />
          <FxText variant="bodyXSRegular">{s}</FxText>
        </FxBox>
      ))}
    </Row>
  );
}

function LedDemo() {
  return (
    <FxBox gap="16">
      <Row>
        <FxLedDot color="cyan" label="Blinking cyan" />
        <FxLedDot color="#FA5252" onInterval={200} offInterval={200} label="Fast red" />
        <FxLedDot color="successBase" offInterval={0} label="Solid green" />
      </Row>
      <FxLedSequence
        direction="row"
        steps={[
          { color: 'lightblue', label: 'Booting' },
          { color: 'cyan', onInterval: 300, offInterval: 300, label: 'Hotspot ready' },
          { color: 'successBase', offInterval: 0, label: 'Connected' },
        ]}
      />
      <FxTower onColor="lightblue" offColor="gray" height={120} label="Blox tower" />
    </FxBox>
  );
}

function PageHeaderDemo() {
  return (
    <FxPageHeader
      title="Pool details"
      subtitle="Pool #1 · SKALE"
      onBack={() => alert('back')}
      actions={<FxIconButton aria-label="Refresh" icon={<FxRefreshIcon />} />}
    />
  );
}

function EmptyStateDemo() {
  return (
    <FxEmptyState
      icon={<BloxIcon />}
      title="No Blox paired yet"
      description="Connect to the FxBlox hotspot or use Bluetooth to add your first Blox."
      action={<FxButton>Add a Blox</FxButton>}
      compact
    />
  );
}

function SkeletonDemo() {
  return (
    <FxBox gap="12">
      <Row>
        <FxSkeleton width={120} height={16} />
        <FxSkeleton width={40} circle />
        <FxSkeleton width={200} height={40} radius="l" />
      </Row>
      <FxListSkeleton rows={2} />
    </FxBox>
  );
}

function TooltipDemo() {
  return (
    <Row>
      <FxTooltip content="Refresh the pool list">
        <FxIconButton aria-label="Refresh" icon={<FxRefreshIcon />} />
      </FxTooltip>
      <FxTooltip content="Bottom placement" side="bottom">
        <FxButton variant="inverted">Hover me</FxButton>
      </FxTooltip>
    </Row>
  );
}

function TabsDemo() {
  const [i, setI] = useState(0);
  const [j, setJ] = useState(1);
  return (
    <FxBox gap="16">
      <FxTabs
        items={['Overview', 'Plugins', 'Logs']}
        selectedIdx={i}
        onSelect={setI}
        aria-label="Fixed tabs"
      >
        <FxTabs.Panel index={0}>
          <FxText marginTop="12">Overview panel</FxText>
        </FxTabs.Panel>
        <FxTabs.Panel index={1}>
          <FxText marginTop="12">Plugins panel</FxText>
        </FxTabs.Panel>
        <FxTabs.Panel index={2}>
          <FxText marginTop="12">Logs panel</FxText>
        </FxTabs.Panel>
      </FxTabs>
      <FxTabs
        variant="auto"
        items={['All', 'Active', 'Pending']}
        selectedIdx={j}
        onSelect={setJ}
        aria-label="Auto tabs"
      />
    </FxBox>
  );
}

function TableDemo() {
  return (
    <FxTable>
      <FxTable.Header>
        <FxTable.Title>Name</FxTable.Title>
        <FxTable.Title>Status</FxTable.Title>
        <FxTable.Title width={80}>Size</FxTable.Title>
      </FxTable.Header>
      <FxTable.Row>
        <FxTable.Cell>blox-ai</FxTable.Cell>
        <FxTable.Cell>running</FxTable.Cell>
        <FxTable.Cell>1.2 GB</FxTable.Cell>
      </FxTable.Row>
      <FxTable.RowGroup
        firstRow={
          <>
            <FxTable.Cell>ipfs-cluster</FxTable.Cell>
            <FxTable.Cell>running</FxTable.Cell>
          </>
        }
        hiddenRow={<FxTable.Cell>peers: 4 · pins: 1 204</FxTable.Cell>}
      />
      <FxTable.Row showSeparator={false}>
        <FxTable.Cell>go-fula</FxTable.Cell>
        <FxTable.Cell>stopped</FxTable.Cell>
        <FxTable.Cell>—</FxTable.Cell>
      </FxTable.Row>
    </FxTable>
  );
}

function BreadcrumbsDemo() {
  return (
    <FxBreadcrumbs
      path={[
        { label: 'Settings', onPress: () => alert('Settings') },
        { label: 'Pools', onPress: () => alert('Pools') },
        { label: 'Pool #1', onPress: () => undefined },
      ]}
    />
  );
}

function ButtonGroupDemo() {
  const [i, setI] = useState<number | null>(0);
  return (
    <FxBox gap="12" maxWidth={360}>
      <FxButtonGroup
        items={['Day', 'Week', 'Month']}
        selectedIdx={i}
        onSelect={setI}
        aria-label="Range"
      />
      <FxButtonGroup items={['A', 'B']} selectedIdx={1} onSelect={() => undefined} disabled />
    </FxBox>
  );
}

function FoldableDemo() {
  return (
    <FxFoldableContent
      header={<FxText variant="bodySmallSemibold">Advanced (click to expand)</FxText>}
      paddingVertical="8"
    >
      <FxText color="content3" marginTop="8">
        Hidden content
      </FxText>
    </FxFoldableContent>
  );
}

function LinkDemo() {
  return (
    <Row>
      <FxLink onPress={() => alert('link')}>Small link</FxLink>
      <FxLink size="large" href="https://fx.land" target="_blank" rel="noreferrer">
        Large anchor
      </FxLink>
      <FxLink disabled>Disabled</FxLink>
      <FxLink iconRight={<FxPlusIcon />}>With icon</FxLink>
    </Row>
  );
}

function SliderDemo() {
  const [v, setV] = useState(40);
  return (
    <FxBox gap="12" maxWidth={360} paddingTop="24">
      <FxSlider
        value={v}
        onValueChange={setV}
        minimumValue={0}
        maximumValue={100}
        step={5}
        label="GB"
        aria-label="Storage"
      />
      <FxSlider value={30} minimumValue={0} maximumValue={100} disabled aria-label="Disabled" />
    </FxBox>
  );
}

function PickerDemo() {
  const [v, setV] = useState<string | number>('ca');
  return (
    <FxPicker caption="Country" selectedValue={v} onValueChange={(val) => setV(val)} maxWidth={320}>
      <FxPickerItem label="Canada" value="ca" />
      <FxPickerItem label="United States" value="us" />
      <FxPickerItem label="Germany" value="de" />
    </FxPicker>
  );
}

function FileDemo() {
  return (
    <FxBox gap="12">
      <FxFile
        type="pdf"
        name="Invoice-2026.pdf"
        details="1.2 MB · yesterday"
        onPress={() => undefined}
        onOptionsPress={() => alert('options')}
      />
      <Row>
        <FxFile compact type="folder" name="Photos" onOptionsPress={() => undefined} />
        <FxFile compact type="audio" name="track.mp3" disabled />
      </Row>
    </FxBox>
  );
}

function LineChartDemo() {
  return <FxLineChart points={[2, 5, 3, 8, 12, 9, 14, 18, 11, 16]} height={140} />;
}

function IconsDemo() {
  const entries = Object.entries(generatedIcons) as [
    string,
    ComponentType<{ width?: number; height?: number }>,
  ][];
  return (
    <FxBox flexDirection="row" flexWrap="wrap" gap="12">
      {entries.map(([name, Icon]) => (
        <FxBox key={name} alignItems="center" width={88} gap="4">
          <Icon width={24} height={24} />
          <FxText variant="bodyXXSRegular" color="content3" numberOfLines={1} maxWidth="100%">
            {name}
          </FxText>
        </FxBox>
      ))}
    </FxBox>
  );
}

function PrimitivesDemo() {
  return (
    <FxBox gap="8">
      <FxBox flexDirection="row" gap="8">
        <FxBox
          flex={1}
          padding="12"
          backgroundColor="backgroundPrimary"
          borderRadius="s"
          borderWidth={1}
          borderColor="border"
        >
          <FxText variant="bodyXSRegular">FxBox with restyle props</FxText>
        </FxBox>
        <FxBox flex={1} padding="12" backgroundColor="greenBackground" borderRadius="l">
          <FxText variant="bodyXSRegular" color="greenPressed">
            greenBackground / l radius
          </FxText>
        </FxBox>
      </FxBox>
      <FxHorizontalRule />
    </FxBox>
  );
}

export const galleryEntries: GalleryEntry[] = [
  { id: 'primitives', title: 'FxBox / FxHorizontalRule', Component: PrimitivesDemo },
  { id: 'text', title: 'FxText variants', Component: TextDemo },
  { id: 'button', title: 'FxButton', Component: ButtonDemo },
  { id: 'icon-button', title: 'FxIconButton', Component: IconButtonDemo },
  { id: 'card', title: 'FxCard', Component: CardDemo },
  { id: 'tag', title: 'FxTag', Component: TagDemo },
  { id: 'input', title: 'FxTextInput / FxTextArea', Component: InputDemo },
  { id: 'radio', title: 'FxRadioButton (single + multi)', Component: RadioDemo },
  { id: 'switch', title: 'FxSwitch', Component: SwitchDemo },
  { id: 'dropdown', title: 'FxDropdown', Component: DropdownDemo },
  { id: 'header', title: 'FxHeader', Component: HeaderDemo },
  { id: 'progress', title: 'FxProgressBar', Component: ProgressDemo },
  { id: 'spinner', title: 'FxLoadingSpinner / FxSpinner', Component: SpinnerDemo },
  { id: 'error', title: 'FxError / FxWarning', Component: ErrorDemo },
  { id: 'avatar', title: 'FxAvatar', Component: AvatarDemo },
  { id: 'sheet', title: 'FxSheet', Component: SheetDemo },
  { id: 'dialog', title: 'FxDialog', Component: DialogDemo },
  { id: 'confirm', title: 'useConfirm', Component: ConfirmDemo },
  { id: 'toast', title: 'Toast', Component: ToastDemo },
  { id: 'code-block', title: 'FxCodeBlock', Component: CodeBlockDemo },
  { id: 'copy', title: 'FxCopyButton', Component: CopyDemo },
  { id: 'status-dot', title: 'FxStatusDot', Component: StatusDotDemo },
  { id: 'led', title: 'FxLedDot / FxLedSequence / FxTower', Component: LedDemo },
  { id: 'page-header', title: 'FxPageHeader', Component: PageHeaderDemo },
  { id: 'empty-state', title: 'FxEmptyState', Component: EmptyStateDemo },
  { id: 'skeleton', title: 'FxSkeleton / FxListSkeleton', Component: SkeletonDemo },
  { id: 'tooltip', title: 'FxTooltip', Component: TooltipDemo },
  { id: 'tabs', title: 'FxTabs', Component: TabsDemo },
  { id: 'table', title: 'FxTable', Component: TableDemo },
  { id: 'breadcrumbs', title: 'FxBreadcrumbs', Component: BreadcrumbsDemo },
  { id: 'button-group', title: 'FxButtonGroup', Component: ButtonGroupDemo },
  { id: 'foldable', title: 'FxFoldableContent', Component: FoldableDemo },
  { id: 'link', title: 'FxLink', Component: LinkDemo },
  { id: 'slider', title: 'FxSlider', Component: SliderDemo },
  { id: 'picker', title: 'FxPicker', Component: PickerDemo },
  { id: 'file', title: 'FxFile', Component: FileDemo },
  { id: 'line-chart', title: 'FxLineChart', Component: LineChartDemo },
  { id: 'icons', title: 'Icons (generated)', Component: IconsDemo },
];
