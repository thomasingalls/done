import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalApp } from './ui/LocalApp';
import { BOOT, mark } from './lib/marks';
import { prepareInstallPrompt, registerServiceWorker } from './pwa';
import './styles/index.css';

// Imports evaluate before this line, so it marks the end of everything the
// browser had to do before the app could begin: fetch, parse, compile and
// initialise the whole module graph.
mark(BOOT);

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

prepareInstallPrompt();

createRoot(root).render(
  <StrictMode>
    <LocalApp />
  </StrictMode>,
);

registerServiceWorker();
