// < 900px default header (mobile BloxHeader): current Blox + the three header actions.
import { CurrentBloxIndicator } from '@/components/CurrentBloxIndicator';
import { ShellActions } from './ShellActions';

export function MobileHeader({ onOpenProfile }: { onOpenProfile: () => void }) {
  return (
    <header
      data-testid="mobile-header"
      className="flex items-center justify-between gap-3 px-5 py-3"
    >
      <div className="min-w-0 flex-1">
        <CurrentBloxIndicator compact />
      </div>
      <ShellActions onOpenProfile={onOpenProfile} />
    </header>
  );
}
