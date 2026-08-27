/**
 * PoolsLayout (`/settings/pools/*`): master-detail — the pool list (`screens/Settings/Pools/Pools.tsx`) stays in
 * a left column while `:poolId` / `:poolId/join-requests` render on the right. The split kicks in at the `wide`
 * breakpoint (≥ 1280px): between 900 and 1279px the Settings menu column already takes 300px, and a third column
 * would leave the detail under 400px. Below that the routes are separate pages.
 */
import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FxEmptyState, FxPoolIcon, useIsWide } from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { FullScreenSpinner } from '@/components/FullScreenSpinner';

const PoolsList = lazy(() => import('@/screens/Settings/Pools/Pools'));

export function PoolsIndexPlaceholder() {
  const { t } = useTranslation();
  return (
    <div data-screen="pools-index" className="flex flex-1 items-center justify-center">
      <FxEmptyState
        icon={<FxPoolIcon />}
        title={t('shell.pools.select')}
        description={t('shell.pools.selectHint')}
      />
    </div>
  );
}

export function PoolsLayout() {
  const isWide = useIsWide();
  const { pathname } = useLocation();
  const atIndex = pathname.replace(/\/+$/, '') === paths.settings.pools;

  if (!isWide) return <Outlet />;

  return (
    <div
      data-testid="pools-layout"
      className="grid grid-cols-[minmax(280px,360px)_minmax(0,1fr)] gap-6"
    >
      <aside className="min-w-0">
        <Suspense fallback={<FullScreenSpinner fullscreen={false} />}>
          <PoolsList />
        </Suspense>
      </aside>
      <section className="flex min-w-0 flex-col">
        {atIndex ? <PoolsIndexPlaceholder /> : <Outlet />}
      </section>
    </div>
  );
}

export default PoolsLayout;
