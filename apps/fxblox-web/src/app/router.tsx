/**
 * The browser router. `basename` = Vite's `BASE_URL` without its trailing slash — `/fxblox-web/` as deployed
 * (https://docs.fx.land/fxblox-web/), `/` if the app ever moves to its own domain. Route modules are lazy
 * (one chunk per screen).
 */
import { createBrowserRouter } from 'react-router';
import { appRoutes } from './routes/appRoutes';

export function normalizeBasename(base: string | undefined): string {
  const trimmed = (base ?? '/').replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export const router = createBrowserRouter(appRoutes, {
  basename: normalizeBasename(import.meta.env.BASE_URL),
});

export type AppRouter = typeof router;
