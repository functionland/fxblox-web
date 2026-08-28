// Port of apps/box/src/components/LanguageSelector.tsx on a Radix DropdownMenu (menuitemradio semantics,
// keyboard operable, portal inherits [data-theme]).
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { FxChevronDownIcon, cn } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';
import { changeLanguage, type SupportedLanguage } from '@/i18n';

interface Language {
  code: SupportedLanguage;
  /** Short label shown on the trigger (mobile: EN / 中). */
  label: string;
  nameKey: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', label: 'EN', nameKey: 'shell.language.en' },
  { code: 'zh', label: '中', nameKey: 'shell.language.zh' },
];

export interface LanguageSelectorProps {
  className?: string;
  align?: 'start' | 'end';
}

export function LanguageSelector({ className, align = 'end' }: LanguageSelectorProps) {
  const { t, i18n } = useTranslation();
  const current =
    LANGUAGES.find((l) => (i18n.language ?? '').toLowerCase().startsWith(l.code)) ?? LANGUAGES[0]!;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t('shell.language.label')}
          data-testid="language-selector"
          className={cn(
            // flex-row: .fx-pressable defaults to column (RN parity) and `inline-flex` only sets display.
            'fx-pressable inline-flex h-10 min-w-[44px] flex-row items-center justify-center gap-1 rounded-fx-l px-3',
            'fx-text-bodySmallSemibold text-content1 hover:bg-background-secondary data-[state=open]:bg-background-secondary',
            className,
          )}
        >
          <span aria-hidden="true">{current.label}</span>
          <span className="sr-only">{t(current.nameKey)}</span>
          <FxChevronDownIcon width={16} height={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[170px] rounded-fx-m border border-border bg-background-primary p-1 shadow-lg"
        >
          <DropdownMenu.RadioGroup
            value={current.code}
            onValueChange={(v) => void changeLanguage(v)}
          >
            {LANGUAGES.map((lang) => (
              <DropdownMenu.RadioItem
                key={lang.code}
                value={lang.code}
                lang={lang.code}
                className={cn(
                  'flex cursor-pointer select-none items-center justify-between gap-4 rounded-fx-s px-3 py-2 outline-none',
                  'fx-text-bodySmallRegular text-content1 data-[highlighted]:bg-background-secondary data-[state=checked]:text-primary',
                )}
              >
                <span>{t(lang.nameKey)}</span>
                <span className="fx-text-bodyXSRegular text-content3">{lang.label}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default LanguageSelector;
