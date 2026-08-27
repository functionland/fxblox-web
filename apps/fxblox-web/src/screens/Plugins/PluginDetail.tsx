// STUB — replaced in place by the main-tabs screen builder (mobile: screens/Plugin.screen.tsx). Route: /plugins/:name
import { useParams } from 'react-router';
import { paths } from '@/app/paths';
import { StubScreen } from '@/screens/StubScreen';

export default function PluginDetail() {
  const { name } = useParams<{ name: string }>();
  return <StubScreen titleKey="main.screens.plugin" params={{ name }} back={paths.plugins} />;
}
