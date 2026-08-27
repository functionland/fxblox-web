// STUB — replaced in place by the settings screen builder (mobile: screens/Settings/PoolDetails.screen.tsx). Route: /settings/pools/:poolId
import { useParams } from 'react-router';
import { paths } from '@/app/paths';
import { StubScreen } from '@/screens/StubScreen';

export default function PoolDetails() {
  const { poolId } = useParams<{ poolId: string }>();
  return <StubScreen titleKey="Pool details" params={{ poolId }} back={paths.settings.pools} />;
}
