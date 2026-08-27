/**
 * Page wrapper for every settings detail screen: `FxPageHeader` (back button on phones — on desktop the
 * SettingsLayout already shows the menu beside the detail, so the chevron is hidden unless `backOnDesktop`),
 * a 720px reading column and a `data-screen` hook for tests / E2E.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxPageHeader, cn, useIsDesktop } from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export interface SettingsScreenProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** `data-screen` value (kebab-case). */
  screen: string;
  /** Back-button fallback when there is no in-app history (direct load). Default: the settings index. */
  backTo?: string;
  /** Show the back chevron even at ≥ 900px (pool detail pages between 900 and 1279px). */
  backOnDesktop?: boolean;
  actions?: ReactNode;
  /** Column width (default 720px; pools use the full width of the layout column). */
  wide?: boolean;
  className?: string;
  children?: ReactNode;
}

export function SettingsScreen({
  title,
  subtitle,
  screen,
  backTo = paths.settings.root,
  backOnDesktop = false,
  actions,
  wide = false,
  className,
  children,
}: SettingsScreenProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const { back } = useAppNavigate();
  const showBack = !isDesktop || backOnDesktop;

  return (
    <FxBox
      as="section"
      data-screen={screen}
      className={cn(
        'mx-auto w-full px-5 pb-8',
        wide ? 'max-w-[1200px]' : 'max-w-[720px]',
        className,
      )}
    >
      <FxPageHeader
        title={title}
        subtitle={subtitle}
        onBack={showBack ? () => back(backTo) : undefined}
        backLabel={t('settings.common.back')}
        actions={actions}
      />
      {children}
    </FxBox>
  );
}

export default SettingsScreen;
