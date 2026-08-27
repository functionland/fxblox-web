/**
 * Label + monospace value + copy (and optional share) — the "peer id with a copy icon" rows of the pairing screens.
 */
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxCopyButton,
  FxIconButton,
  FxShareIcon,
  FxText,
  useShare,
  useToast,
  type FxBoxProps,
} from '@functionland/fx-ui';

export interface PeerIdRowProps extends Omit<FxBoxProps, 'children' | 'title'> {
  label: string;
  value: string;
  /** Toast message after a successful copy (mobile: "Peer ID copied to clipboard"). */
  copiedMessage?: string;
  /** Show a share button (mobile: `Share.share({ title, message })`). */
  shareTitle?: string;
  centered?: boolean;
  testID?: string;
}

export function PeerIdRow({
  label,
  value,
  copiedMessage,
  shareTitle,
  centered,
  testID,
  ...rest
}: PeerIdRowProps) {
  const { t } = useTranslation();
  const { queueToast } = useToast();
  const { share } = useShare();

  const onShare = async () => {
    const result = await share({ title: shareTitle ?? label, text: value });
    if (result === 'copied') queueToast({ type: 'success', message: t('setup.common.copied') });
    else if (result === 'failed')
      queueToast({ type: 'error', message: t('setup.common.shareFailed') });
  };

  return (
    <FxBox testID={testID} {...rest}>
      <FxText
        variant="bodySmallSemibold"
        color="content1"
        textAlign={centered ? 'center' : undefined}
      >
        {label}
      </FxText>
      <FxBox
        flexDirection="row"
        alignItems="center"
        justifyContent={centered ? 'center' : undefined}
        gap="4"
        minWidth={0}
      >
        <FxText
          variant="bodySmallLight"
          color="content3"
          className="min-w-0 break-all font-mono"
          textAlign={centered ? 'center' : undefined}
          testID={testID ? `${testID}-value` : undefined}
        >
          {value}
        </FxText>
        <FxCopyButton
          value={value}
          label={`${t('setup.common.copy')} ${label}`}
          copiedLabel={t('setup.common.copied')}
          onCopied={(ok) => {
            if (ok && copiedMessage) queueToast({ type: 'success', message: copiedMessage });
          }}
        />
        {shareTitle && (
          <FxIconButton
            aria-label={`${t('setup.common.share')} ${label}`}
            icon={<FxShareIcon />}
            onPress={() => void onShare()}
          />
        )}
      </FxBox>
    </FxBox>
  );
}

export default PeerIdRow;
