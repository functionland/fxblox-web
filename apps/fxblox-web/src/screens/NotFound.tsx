// `*` route (and 404 route errors): a page with a way home rather than a silent redirect.
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FxButton, FxEmptyState, FxExclamationIcon } from '@functionland/fx-ui';
import { paths } from '@/app/paths';

export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <main
      data-screen="not-found"
      className="grid min-h-dvh place-items-center bg-background-app px-5 text-content1"
    >
      <FxEmptyState
        icon={<FxExclamationIcon />}
        title={t('shell.notFound.title')}
        description={t('shell.notFound.description')}
        action={
          <FxButton onPress={() => void navigate(paths.root, { replace: true })}>
            {t('shell.notFound.home')}
          </FxButton>
        }
      />
    </main>
  );
}
