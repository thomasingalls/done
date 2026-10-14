import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
const LocalApp = lazy(() =>
  import('./ui/LocalEntry').then((module) => ({ default: module.LocalEntry })),
);
import { BOOT, mark } from './lib/marks';
import { prepareInstallPrompt, registerServiceWorker } from './pwa';
import { hasSavedAccountEntry, loadPackagedConfig } from './account/packagedConfig';
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
// Local erasure must remain reachable while locked, offline, or without a service configuration.
if (/^\/remove\/(local|account-[a-f0-9]{32}|enrollment-[a-f0-9]{32})\/?$/.test(location.pathname)) {
  view.render(
    <Suspense fallback={<p role="status">Opening local data controls…</p>}>
      <LocalApp />
    </Suspense>,
  );
} else
  void (async () => {
    // Service discovery can prepare sidebar sync in the background; first Local use never waits for it.
    const discovery = loadPackagedConfig();
    void discovery.catch(() => {});
    if (location.pathname === '/' && !(await hasSavedAccountEntry())) {
      const open = async (entry: string, name?: string, code?: string) => {
        try {
          const config = await discovery;
          if (!config)
            throw Error('Sync is not available at this address. Your local list has been kept.');
          view.render(
            await createAccountPreview(config, {
              entry,
              ...(name ? { name } : {}),
              ...(code ? { code } : {}),
            }),
          );
        } catch {
          view.render(
            <main className="local-startup">
              <h1>Sync is unavailable right now</h1>
              <p>Your local list has been kept. Try again when the account service is reachable.</p>
              <button onClick={() => location.reload()}>Back to my local list</button>
            </main>,
          );
        }
      };
      const FirstLocal = await import('./ui/LocalApp');
      view.render(
        <FirstLocal.LocalApp
          onConnectAccount={(name, code) => {
            void open('/setup/local/inspect', name, code);
          }}
          onChooseAccount={() => {
            void open('/accounts');
          }}
          onConnectExisting={() => {
            void open('/connect/choose');
          }}
        />,
      );
      return undefined;
    }
    return discovery;
  })()
    .then(async (config) => {
      if (config === undefined) return;
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
