/**
 * The browser router. `basename` = Vite's `BASE_URL` (`/` in production at blox.fx.land, `/fxblox-web/` on the
 * project-pages staging URL) without its trailing slash. Route modules are lazy (one chunk per screen).
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
