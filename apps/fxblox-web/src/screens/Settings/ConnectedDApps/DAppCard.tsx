/**
 * Port of apps/box/src/screens/Settings/ConnectedDApps/components/{DAppCard,DAppHeader}.tsx.
 * `RowDetails` is shared with the settings sheet.
 */
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  FxTag,
  FxText,
  convertMegabyteToGigabyte,
  type FxBoxProps,
  type FxCardProps,
} from '@functionland/fx-ui';
import type { TDApp } from '@/models';

export interface RowDetailsProps {
  data: Pick<TDApp, 'storageUsed' | 'lastUpdate' | 'name' | 'authorized' | 'bundleId'>;
}

export function RowDetails({ data }: RowDetailsProps) {
  const { t } = useTranslation();
  const lastUpdate = data?.lastUpdate ? new Date(data.lastUpdate) : null;
  return (
    <>
      <FxCard.Row marginTop="24">
        <FxCard.Row.Title>{t('settings.dapps.bundleId')}</FxCard.Row.Title>
        <FxCard.Row.Data>{data?.bundleId}</FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('settings.dapps.currentUse')}</FxCard.Row.Title>
        <FxCard.Row.Data>
          {t('settings.dapps.gb', { value: convertMegabyteToGigabyte(data?.storageUsed || 0) })}
        </FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('settings.dapps.lastUpdate')}</FxCard.Row.Title>
        <FxCard.Row.Data>
          {lastUpdate && !Number.isNaN(lastUpdate.getTime()) ? lastUpdate.toDateString() : '—'}
        </FxCard.Row.Data>
      </FxCard.Row>
    </>
  );
}

export interface DAppHeaderProps extends FxBoxProps {
  imageSrc: string;
  name: string;
  tag?: string;
  info?: string;
}

export function DAppHeader({ name, tag, info, imageSrc, ...props }: DAppHeaderProps) {
  const { t } = useTranslation();
  return (
    <FxBox {...props}>
      <FxBox flexDirection="row" alignItems="center">
        <img
          src={imageSrc}
          alt={t('settings.dapps.logoAlt', { name })}
          width={64}
          height={64}
          className="size-16 shrink-0 object-contain"
          draggable={false}
        />
        <FxBox marginLeft="16" alignItems="flex-start" flexShrink={1} minWidth={0}>
          <FxCard.Title>{name}</FxCard.Title>
          {tag && <FxTag marginTop="12">{tag}</FxTag>}
          {info && (
            <FxText variant="bodyXSRegular" flexShrink={1}>
              {info}
            </FxText>
          )}
        </FxBox>
      </FxBox>
    </FxBox>
  );
}

export interface DAppCardProps extends Omit<FxCardProps, 'onPress' | 'children'> {
  data: TDApp;
  isDetailed?: boolean;
  imageSrc: string;
  /** "{name} settings" button. */
  onPress: () => void;
}

export function DAppCard({ data, isDetailed, imageSrc, onPress, ...props }: DAppCardProps) {
  const { t } = useTranslation();
  if (!data) return null;
  return (
    <FxCard marginTop="16" testID={`dapp-card-${data.peerId || data.bundleId}`} {...props}>
      <DAppHeader imageSrc={imageSrc} name={data.name} tag={data.tag} />
      {isDetailed && (
        <>
          <RowDetails data={data} />
          <FxButton marginTop="20" onPress={onPress} testID="dapp-card-settings">
            {t('settings.dapps.settings', { name: data.name })}
          </FxButton>
        </>
      )}
    </FxCard>
  );
}

export default DAppCard;
