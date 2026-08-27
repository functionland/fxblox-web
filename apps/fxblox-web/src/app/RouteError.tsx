// Router `errorElement`: 404 responses render NotFound; anything else the ErrorBoundary fallback with a way home.
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { FxButton } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from '@/components/ErrorBoundary';
import NotFound from '@/screens/NotFound';
import { env } from '@/config/env';
import { paths } from './paths';

export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

  const message = env.DEV && error instanceof Error ? error.message : undefined;
  if (error) console.error('Route error:', error);

  return (
    <ErrorFallback
      message={message}
      onReload={() => window.location.reload()}
      extraAction={
        <FxButton variant="inverted" onPress={() => void navigate(paths.root, { replace: true })}>
          {t('shell.error.home')}
        </FxButton>
      }
    />
  );
}

export default RouteErrorPage;
