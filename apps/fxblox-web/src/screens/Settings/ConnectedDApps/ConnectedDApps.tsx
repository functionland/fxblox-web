// STUB — replaced in place by the settings screen builder (mobile: screens/Settings/ConnectedDApps.screen.tsx).
// Routes: /settings/dapps and the deep link /connectdapp/:appName/:bundleId/:peerId/:returnDeepLink/:accountId
import { useParams } from 'react-router';
import { paths } from '@/app/paths';
import { StubScreen } from '@/screens/StubScreen';

export default function ConnectedDApps() {
  const { appName, bundleId, peerId, returnDeepLink, accountId } = useParams<{
    appName: string;
    bundleId: string;
    peerId: string;
    returnDeepLink: string;
    accountId: string;
  }>();
  return (
    <StubScreen
      titleKey="settings.menu.connectedDApps"
      params={{ appName, bundleId, peerId, returnDeepLink, accountId }}
      back={paths.settings.root}
    />
  );
}
