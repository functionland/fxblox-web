// Header actions (mobile BloxHeader): "+" → link-password (add a Blox), grid → Blox manager, avatar → ProfileSheet.
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FxGridIcon, FxIconButton, FxPlusIcon, FxUserIcon } from '@functionland/fx-ui';
import { paths } from '@/app/paths';

export interface ShellActionsProps {
  onOpenProfile: () => void;
}

export function ShellActions({ onOpenProfile }: ShellActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex shrink-0 items-center gap-1" data-testid="shell-actions">
      <FxIconButton
        aria-label={t('shell.topBar.addBlox')}
        icon={<FxPlusIcon />}
        onPress={() => void navigate(paths.setup.linkPassword)}
      />
      <FxIconButton
        aria-label={t('shell.topBar.manageBloxs')}
        icon={<FxGridIcon />}
        onPress={() => void navigate(paths.bloxManage)}
      />
      <FxIconButton
        aria-label={t('shell.topBar.profile')}
        icon={<FxUserIcon />}
        variant="subtle"
        borderRadius="l"
        onPress={onOpenProfile}
        testID="open-profile"
      />
    </div>
  );
}
