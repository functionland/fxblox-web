// Port of apps/box/src/components/Version.tsx — react-native-device-info → build constants.
import { FxText, type FxTextProps } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';
import { env } from '@/config/env';

export function Version(props: Omit<FxTextProps, 'children'>) {
  const { t } = useTranslation();
  return (
    <FxText
      textAlign="center"
      variant="bodyXXSRegular"
      color="content3"
      testID="app-version"
      {...props}
    >
      {t('shell.version', { version: env.APP_VERSION, build: env.GIT_SHA })}
    </FxText>
  );
}

export default Version;
