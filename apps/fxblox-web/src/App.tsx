import { useMemo } from 'react';
import { detectBrowserSupport } from './platform/browserSupport.js';

const shell: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  textAlign: 'center',
};

export function App() {
  const support = useMemo(() => detectBrowserSupport(), []);

  if (!support.supported) {
    return (
      <main style={shell}>
        <div style={{ maxWidth: 560 }}>
          <h1 style={{ fontFamily: 'var(--fx-font-heading)' }}>FxBlox needs Chrome or Edge</h1>
          <p style={{ color: 'var(--fx-content2)' }}>
            Managing a Blox from the browser uses Web Bluetooth, WebTransport and Chrome&apos;s local-network
            permission, which this browser does not provide ({support.reasons.join(', ')}).
          </p>
          <p style={{ color: 'var(--fx-content3)' }}>
            Use Chrome or Edge on desktop / Android, or the FxBlox mobile app.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={shell}>
      <div>
        <h1 style={{ fontFamily: 'var(--fx-font-heading)', color: 'var(--fx-primary)' }}>FxBlox Web</h1>
        <p style={{ color: 'var(--fx-content2)' }}>Phase 0 scaffold — the app is under construction.</p>
        <p style={{ color: 'var(--fx-content3)', fontSize: 12 }}>
          v{__APP_VERSION__} · {__GIT_SHA__} · {__BUILD_TIME__}
        </p>
      </div>
    </main>
  );
}
