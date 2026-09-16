import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createAccountSignIn } from '../account/accountSignIn';
import { rememberedAccounts, type SetupConfig } from '../account/firstDeviceSetup';
import type { RememberedAccount } from '../account/accountIdentity';
import { AccountIdentity } from './AccountIdentity';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';

export function AccountSignIn({
  config,
  onSelect,
  onCreate,
  onRestore,
}: {
  config: SetupConfig;
  onSelect: (slotId: string) => void;
  onCreate: () => Promise<void>;
  onRestore: () => void;
}) {
  const [owner] = useState(() => createAccountSignIn(config));
  const [remembered, setRemembered] = useState<RememberedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let live = true;
    void rememberedAccounts(config.pin)
      .then((value) => {
        if (live) {
          setRemembered(value);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) setLoading(false);
      });
    const retire = () => owner.close();
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) onRestore();
    };
    window.addEventListener('pagehide', retire);
    window.addEventListener('pageshow', restore);
    return () => {
      live = false;
      window.removeEventListener('pagehide', retire);
      window.removeEventListener('pageshow', restore);
      owner.close();
    };
  }, [config, owner, onRestore]);
  useEffect(() => {
    heading.current?.focus();
  }, [state.kind]);
  const selectSavedAccount = (slotId: string) => {
    owner.close();
    onSelect(slotId);
  };
  const same =
    state.kind === 'verified' && remembered.some((account) => state.accountId === account.id);
  const savedAccounts = (
    <section className="account-saved" aria-labelledby="saved-accounts-title">
      <h2 id="saved-accounts-title">Saved on this device</h2>
      {remembered.length > 0 ? (
        <ul className="account-picker" aria-label="Saved accounts">
          {remembered.map((account) => (
            <li key={account.slotId}>
              <button
                className="account-picker-row"
                aria-label={`${account.connected ? 'Unlock' : 'Continue setup for'} ${account.name ?? 'new account'}${account.id ? `, account ${account.id}` : ''}`}
                onClick={() => selectSavedAccount(account.slotId)}
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
        </ul>
      ) : loading ? (
        <p role="status">Loading saved accounts…</p>
      ) : (
        <>
          <p>No saved accounts are available.</p>
          <button className="local-secondary" onClick={() => selectSavedAccount('local')}>
            Resume saved workspace
          </button>
        </>
      )}
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
          {state.kind === 'working'
            ? 'Choose your passkey'
            : state.kind === 'verified'
              ? 'Account verified'
              : 'Choose an account'}
        </h1>
        {state.kind === 'choose' && (
          <>
            <p>Select a saved account, sign in, or create a new account.</p>
            {savedAccounts}
            <div className="account-other">
              <button
                className="setup-primary"
                disabled={creating}
                onClick={() => {
                  void owner.choose();
                }}
              >
                {state.retryProof ? 'Retry verification' : 'Use another account'}
              </button>
              <p className="setup-note">
                Use a passkey for an existing account. Bringing an account from another device still
                needs device linking, which is not available in this preview.
              </p>
              {state.retryProof && (
                <button className="local-secondary" onClick={owner.reset}>
                  Choose a different passkey
                </button>
              )}
              {state.error && (
                <p className="setup-error" role="alert">
                  {state.error}
                </p>
              )}
            </div>
          </>
        )}
        {state.kind === 'working' && (
          <p role="status">The saved account stays locked while you choose.</p>
        )}
        {state.kind === 'verified' && (
          <>
            <AccountIdentity id={state.accountId} />
            <p>
              {same
                ? 'This account is saved on this device. Select it below to unlock your writing.'
                : 'This account’s writing is not on this device. Device linking is not available in this preview yet.'}
            </p>
            {!same && (
              <p className="setup-note">The saved account has stayed locked and unchanged.</p>
            )}
            {!same && (
              <button
                className="setup-primary"
                onClick={() => {
                  void owner.choose();
                }}
              >
                Choose a different passkey
              </button>
            )}
          </>
        )}
        {state.kind !== 'choose' && savedAccounts}
        {state.kind !== 'working' && (
          <div className="account-new">
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
        )}
      </section>
    </main>
  );
}
