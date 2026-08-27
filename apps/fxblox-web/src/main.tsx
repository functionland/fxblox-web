import React from 'react';
import { createRoot } from 'react-dom/client';
import '@functionland/fx-ui/styles.css';
import { App } from './App.js';
import { bootstrapDataLayer } from './app/bootstrap';

// Data layer boot (i18n, theme sync, store hydration, storage persistence, relay cache, status monitor).
// WS4's RootGate awaits the returned promise before routing.
void bootstrapDataLayer();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
