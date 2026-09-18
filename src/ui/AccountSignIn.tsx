import { useEffect, useRef, useState } from 'react';
import { rememberedAccounts, type SetupConfig } from '../account/firstDeviceSetup';
import type { RememberedAccount } from '../account/accountIdentity';
import { AccountIdentity } from './AccountIdentity';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';
import {
  rememberedDeviceConnections,
  deviceConnectionUrl,
  type RememberedDeviceConnection,
} from '../account/deviceConnectionRoutes';

export function AccountSignIn({
  config,
  onSelect,
  onOpenLocal,
  onCreate,
  onRestore,
  onConnect,
}: {
  config: SetupConfig;
  onSelect: (slotId: string) => void;
  onOpenLocal: () => void;
  onCreate: () => Promise<void>;
  onRestore: () => void;
  onConnect?: (workspace?: string) => void;
}) {
  const [remembered, setRemembered] = useState<RememberedAccount[]>([]);
  const [connections, setConnections] = useState<RememberedDeviceConnection[]>([]);
  const [readError, setReadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let live = true;
    void rememberedAccounts(config.pin)
      .then((value) => {
        if (live) {
          setRemembered(value);
          setConnections(rememberedDeviceConnections());
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setReadError(
            'Saved accounts and device connections could not be read. Reload to try again.',
          );
          setLoading(false);
        }
      });
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) onRestore();
    };
    window.addEventListener('pageshow', restore);
    return () => {
      live = false;
      window.removeEventListener('pageshow', restore);
    };
  }, [config, onRestore]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const savedAccounts = (
    <section className="account-choice-section" aria-labelledby="saved-accounts-title">
      <h2 id="saved-accounts-title">Saved on this device</h2>
      {remembered.length > 0 || connections.length > 0 ? (
        <ul className="account-picker" aria-label="Saved accounts">
          {remembered.map((account) => (
            <li key={account.slotId}>
              <button
                className="account-picker-row"
                aria-label={`${account.connected ? 'Unlock' : 'Continue setup for'} ${account.name ?? 'new account'}${account.id ? `, account ${account.id}` : ''}`}
                onClick={() => onSelect(account.slotId)}
                disabled={creating}
              >
                <span className="account-picker-details">
                  <span className="account-picker-name">{account.name ?? 'New account'}</span>
                  {account.id ? (
                    <AccountIdentity id={account.id} />
                  ) : (
                    <span className="account-identity">Setup in progress</span>
                  )}
                </span>
                <span className="account-picker-action" aria-hidden="true">
                  {account.connected ? 'Unlock →' : 'Continue →'}
                </span>
              </button>
            </li>
          ))}
          {connections.map((connection) => (
            <li key={connection.workspaceId}>
              <button
                className="account-picker-row"
                aria-label={`Resume device connection, workspace ${connection.workspaceId}`}
                onClick={() =>
                  onConnect
                    ? onConnect(connection.workspaceId)
                    : location.assign(deviceConnectionUrl(connection.workspaceId))
                }
                disabled={creating}
              >
                <span className="account-picker-details">
                  <span className="account-picker-name">Device connection</span>
                  <span className="account-identity">
                    <span>Workspace ID</span>
                    <code>{connection.workspaceId}</code>
                  </span>
                </span>
                <span className="account-picker-action" aria-hidden="true">
                  Continue →
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : loading ? (
        <p className="setup-note" role="status">
          Loading saved accounts…
        </p>
      ) : readError ? null : (
        <p className="setup-note account-empty">No saved accounts are available.</p>
      )}
      {readError && <p role="alert">{readError}</p>}
    </section>
  );
  return (
    <main className="local-startup workspace-gate account-setup" data-setup-state="account-choice">
      <WorkspaceBackdrop />
      <section
        className="local-startup-panel workspace-gate-panel setup-panel"
        aria-labelledby="account-choice-title"
      >
        <span className="local-brand">done</span>
        <h1 id="account-choice-title" ref={heading} tabIndex={-1}>
          Choose an account
        </h1>
        <p>Select a saved account, connect devices, or create a new account.</p>
        {savedAccounts}
        {!loading && !remembered.some((account) => account.slotId === 'local') && (
          <div className="account-choice-section">
            <button className="setup-primary" onClick={onOpenLocal} disabled={creating}>
              Open local-only workspace
            </button>
          </div>
        )}
        <div className="account-choice-section">
          <button
            className="setup-primary"
            disabled={creating}
            onClick={() =>
              onConnect ? onConnect() : location.assign('/private/account-enrollment.html')
            }
          >
            Use another account
          </button>
          <p className="setup-note">
            Connect using an invitation from another device, or invite a device to a saved account.
          </p>
        </div>
        <div className="account-choice-section">
          <button
            className="setup-primary"
            disabled={creating}
            onClick={() => {
              if (creating) return;
              setCreating(true);
              setCreateError('');
              void onCreate().catch((cause: unknown) => {
                setCreateError(
                  cause instanceof Error
                    ? cause.message
                    : 'Account setup could not start. Try again.',
                );
                setCreating(false);
              });
            }}
          >
            {creating
              ? 'Preparing account setup…'
              : remembered.some((account) => account.fresh && !account.connected)
                ? 'Continue new account setup'
                : 'Create a new account'}
          </button>
          <p className="setup-note">Start with an empty list and a new passkey.</p>
          {createError && (
            <p className="setup-error" role="alert">
              {createError}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
