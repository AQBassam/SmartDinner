import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { captureInstallPrompt } from './lib/install';
import './index.css';

// The page must be RTL even when embedded in a host document that sets its own <html> attributes.
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

captureInstallPrompt();

// After a release the new service worker takes control of this open page; reload once so the page and
// its lazy chunks come from the same release (the old release's files are gone from the server).
if ('serviceWorker' in navigator) {
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) window.location.reload();
    controlled = true;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
