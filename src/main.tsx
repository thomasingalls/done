import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
const LocalApp = lazy(() =>
  import('./ui/LocalApp').then((module) => ({ default: module.LocalApp })),
);
import { BOOT, mark } from './lib/marks';
import { prepareInstallPrompt, registerServiceWorker } from './pwa';
import { loadPackagedConfig } from './account/packagedConfig';
import { createAccountPreview } from './ui/AccountPreview';
import './styles/index.css';
import './styles/local-startup.css';
import './styles/account-setup.css';

// Imports evaluate before this line, so it marks the end of everything the
// browser had to do before the app could begin: fetch, parse, compile and
// initialise the whole module graph.
mark(BOOT);

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

prepareInstallPrompt();

registerServiceWorker();
const view = createRoot(root);
view.render(<p role="status">Opening…</p>);
void loadPackagedConfig()
  .then(async (config) => {
    view.render(
      config ? (
        await createAccountPreview(config)
      ) : (
        <StrictMode>
          <Suspense fallback={<p role="status">Opening…</p>}>
            <LocalApp />
          </Suspense>
        </StrictMode>
      ),
    );
  })
  .catch(() => {
    view.render(
      <main className="local-startup">
        <h1>Could not open the account service</h1>
        <p>Connect once to prepare this app for offline use. Saved browser data has been kept.</p>
        <button onClick={() => location.reload()}>Try again</button>
        <button
          onClick={() =>
            view.render(
              <Suspense fallback={<p role="status">Opening…</p>}>
                <LocalApp />
              </Suspense>,
            )
          }
        >
          Open local-only workspace
        </button>
      </main>,
    );
  });
