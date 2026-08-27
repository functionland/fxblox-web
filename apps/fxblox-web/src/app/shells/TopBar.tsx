// ≥ 900px top bar: current Blox + status dot, "+" → link-password, grid → /blox/manage, avatar → ProfileSheet.
import { cn } from '@functionland/fx-ui';
import { CurrentBloxIndicator } from '@/components/CurrentBloxIndicator';
import { ShellActions } from './ShellActions';

export interface TopBarProps {
  onOpenProfile: () => void;
  className?: string;
}

export function TopBar({ onOpenProfile, className }: TopBarProps) {
  return (
    <header
      data-testid="top-bar"
      className={cn(
        'sticky top-0 z-20 hidden h-16 items-center justify-between gap-4 border-b border-border bg-background-app/95 px-6 backdrop-blur desktop:flex',
        className,
      )}
    >
      <div className="min-w-0 max-w-[420px] flex-1">
        <CurrentBloxIndicator compact />
      </div>
      <ShellActions onOpenProfile={onOpenProfile} />
    </header>
  );
}
