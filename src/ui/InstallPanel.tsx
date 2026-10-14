import { useRef, useState, useSyncExternalStore } from 'react';
import { installHelp, readInstallState, requestInstall, subscribeToInstallState } from '../pwa';
import { useWorkspaceUi } from './workspaceUi';

export const InstallPanel = () => {
  const { requestStoragePersistence } = useWorkspaceUi();
  const installState = useSyncExternalStore(
    subscribeToInstallState,
    readInstallState,
    readInstallState,
  );
  const applying = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (installState === 'installed') return null;
  const help = installHelp();
  const install = () => {
    if (applying.current) return;
    applying.current = true;
    setPending(true);
    setMessage('');
    setError('');
    // Start the native prompt inside the click, before awaiting a storage permission.
    const native = requestInstall().catch(() => {
      setError('Installation could not finish. Try again.');
    });
    void Promise.all([native, requestStoragePersistence()])
      .then(([, persistence]) => {
        setMessage(
          persistence === 'granted'
            ? 'Persistent local storage is enabled.'
            : persistence === 'denied'
              ? 'The browser did not grant persistent storage. Local storage is best-effort.'
              : 'This browser does not offer persistent storage permission.',
        );
      })
      .catch(() => {
        setError('Local storage setup could not finish. Try again.');
      })
      .finally(() => {
        applying.current = false;
        setPending(false);
      });
  };
  return (
    <section className="menu-section" aria-label="Install">
      <h2 className="menu-heading">Install</h2>
      <p className="menu-note">
        {installState === 'available'
          ? 'Install done and check permission to keep local writing on this device.'
          : 'Check permission to keep local writing in this browser.'}
      </p>
      {help && <p className="menu-note">{help}</p>}
      <button type="button" className="menu-button" disabled={pending} onClick={install}>
        {pending ? 'Setting up…' : 'Install'}
      </button>
      {message && (
        <p className="menu-note" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="menu-note" role="alert">
          {error}
        </p>
      )}
    </section>
  );
};
