// STUB — replaced in place by the main-tabs screen builder (mobile: screens/Diagnostics/Diagnostics.screen.tsx).
// `?scenario=` is the mobile `prefillScenario` param: read once, then stripped from the URL (useConsumeOnce).
import { useConsumeOnce } from '@/hooks/useConsumeOnce';
import { StubScreen } from '@/screens/StubScreen';

export default function Diagnostics() {
  const scenario = useConsumeOnce('scenario');
  return (
    <StubScreen
      titleKey="main.screens.bloxAi"
      params={{ prefillScenario: scenario ?? undefined }}
      back={false}
    />
  );
}
