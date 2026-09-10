import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalApp } from './ui/LocalApp';
import { registerServiceWorker } from './pwa';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from local.html');
createRoot(root).render(
  <StrictMode>
    <LocalApp />
  </StrictMode>,
);
registerServiceWorker();
