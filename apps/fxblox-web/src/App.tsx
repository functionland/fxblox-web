import { useMemo } from 'react';
import { RouterProvider } from 'react-router';
import '@/i18n';
import { AppProviders } from '@/app/providers';
import { router } from '@/app/router';
import { unsupportedOverride } from '@/app/unsupportedOverride';
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser';
import { detectBrowserSupport } from '@/platform/browserSupport';

export function App() {
  const support = useMemo(() => detectBrowserSupport(), []);
  const override = useMemo(() => unsupportedOverride(), []);

  if (!support.supported && !override) {
    return <UnsupportedBrowser reasons={support.reasons} />;
  }

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export default App;
