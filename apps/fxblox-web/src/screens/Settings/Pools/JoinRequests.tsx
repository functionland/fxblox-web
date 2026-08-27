// STUB — replaced in place by the settings screen builder (mobile: screens/Settings/JoinRequests.screen.tsx). Route: /settings/pools/:poolId/join-requests
import { useParams } from 'react-router';
import { paths } from '@/app/paths';
import { StubScreen } from '@/screens/StubScreen';

export default function JoinRequests() {
  const { poolId } = useParams<{ poolId: string }>();
  return (
    <StubScreen
      titleKey="Join requests"
      params={{ poolId }}
      back={poolId ? paths.settings.pool(poolId) : paths.settings.pools}
    />
  );
}
