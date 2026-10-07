import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createFirstDeviceSetup, type SetupConfig } from '../account/firstDeviceSetup';
import { WorkspaceUiProvider } from './workspaceUi';
import { App } from './App';
import { AccountIdentity } from './AccountIdentity';
import { AccountDevices } from './AccountDevices';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';

import { useCeremonyNavigation } from './ceremonyNavigation';

function NameEntry({
  initialName = '',
  button,
  onSubmit,
  onChange,
}: {
  onChange?: ((name: string) => void) | undefined;
  initialName?: string | undefined;
  button: string;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <form
      className="local-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name);
      }}
    >
      <label htmlFor="account-name">Your name</label>
      <input
        id="account-name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          onChange?.(event.target.value);
        }}
        autoComplete="nickname"
        maxLength={80}
        required
        autoFocus
      />
      <p className="setup-note">
        Shown when you return to this device. You can change it in settings.
      </p>
      <button type="submit" className="setup-primary">
        {button}
      </button>
    </form>
  );
}

function CodeEntry({
  label,
  button,
  onSubmit,
}: {
  label: string;
  button: string;
  onSubmit: (code: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      className="local-form"
      onSubmit={(event) => {
        event.preventDefault();
        const code = value;
        setValue('');
        onSubmit(code);
      }}
    >
      <label htmlFor="setup-code">{label}</label>
      <input
        id="setup-code"
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoFocus
      />
      <button type="submit" className="setup-primary">
        {button}
      </button>
    </form>
  );
}

export function Setup({
  config,
  onBack,
  onLock,
  initialName,
  onOtherAccount,
  slotId,
  onName,
  onConnectDevice,
}: {
  config: SetupConfig;
  onBack: () => void;
  onLock: () => void;
  initialName: string;
  onOtherAccount: () => void;
  slotId: string;
  onName?: (name: string) => void;
  onConnectDevice: () => void;
}) {
  const [owner] = useState(() => createFirstDeviceSetup(config, slotId));
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const heading = useRef<HTMLHeadingElement>(null);
  const [inspected, setInspected] = useState(false);
  const [screen, setScreen] = useState<'ready' | 'devices'>('ready');
  const navigation = useCeremonyNavigation({
    base: `/setup/${slotId}`,
    step:
      inspected && state.kind !== 'working' ? (state.kind === 'ready' ? screen : state.kind) : null,
    parent: state.kind === 'intro' && !state.fresh ? '/local/fresh' : '/accounts',
    visit: (step) => {
      if (state.kind === 'ready' && (step === 'ready' || step === 'devices')) {
        setScreen(step);
        return true;
      }
      return owner.visit(step);
    },
    close: owner.close,
    warnOnLeave: owner.hasRecoveryDisplay,
  });
  const leave = (destination: () => void) => {
    if (navigation.enabled) destination();
    else void owner.close().then(destination);
  };
  useEffect(() => {
    void owner.inspect().then(() => setInspected(true));
    const retire = () => {
      void owner.close();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) onLock();
    };
    window.addEventListener('pagehide', retire);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', retire);
      window.removeEventListener('pageshow', restore);
      retire();
    };
  }, [owner, onLock]);
  useEffect(() => {
    heading.current?.focus();
  }, [state.kind]);
  if (navigation.leaving)
    return <p role="status">{navigation.error || 'Locking and finishing storage operations…'}</p>;
  if (state.kind === 'ready')
    return (
      <WorkspaceUiProvider
        workspace={state.workspace}
        actorId={state.actorId}
        devices={state.devices}
        onShowDevices={() => setScreen('devices')}
        registerEditor={owner.registerEditor}
        {...(owner.networkLogin ? { networkLogin: owner.networkLogin } : {})}
        accountWorkspace
        {...(state.accountId ? { accountId: state.accountId } : {})}
        onSwitchAccount={() => {
          leave(onOtherAccount);
        }}
        onLock={() => {
          void owner.close().then(onLock);
        }}
      >
        {screen === 'devices' ? (
          <AccountDevices
            onBack={() => (navigation.enabled ? navigation.back() : setScreen('ready'))}
            onConnect={() => leave(onConnectDevice)}
          />
        ) : (
          <App />
        )}
      </WorkspaceUiProvider>
    );
  const stage =
    state.kind === 'passkey' || state.kind === 'confirm-passkey'
      ? 1
      : state.kind === 'save-recovery' || state.kind === 'confirm-recovery'
        ? 2
        : 0;
  const title =
    state.kind === 'intro'
      ? state.fresh
        ? 'Create a new account'
        : 'Make this your account workspace'
      : state.kind === 'save-device-code'
        ? 'Save your device-lock code'
        : state.kind === 'confirm-device-code'
          ? 'Check your saved device-lock code'
          : state.kind === 'unlock'
            ? state.accountName
              ? `Unlock ${state.accountName}’s account`
              : 'Unlock your workspace'
            : state.kind === 'name'
              ? 'What should we call you?'
              : state.kind === 'passkey'
                ? 'Create your passkey'
                : state.kind === 'confirm-passkey'
                  ? 'Try your new passkey'
                  : state.kind === 'save-recovery'
                    ? 'Save your recovery code'
                    : state.kind === 'confirm-recovery'
                      ? 'Check your saved copy'
                      : 'message' in state
                        ? state.message
                        : 'Account setup';
  return (
    <main className="local-startup workspace-gate account-setup" data-setup-state={state.kind}>
      <WorkspaceBackdrop />
      <section
        className="local-startup-panel workspace-gate-panel setup-panel"
        aria-labelledby="setup-title"
      >
        <span className="local-brand">done</span>
        {navigation.enabled && (
          <button className="local-secondary" onClick={navigation.back}>
            Back
          </button>
        )}
        {state.kind !== 'unlock' && state.kind !== 'working' && state.kind !== 'name' && (
          <ol className="setup-steps" aria-label="Account setup progress">
            {['Your workspace', 'Passkey', 'Recovery code'].map((name, i) => (
              <li key={name} aria-current={stage === i ? 'step' : undefined}>
                {name}
              </li>
            ))}
          </ol>
        )}
        <h1 id="setup-title" tabIndex={-1} ref={heading}>
          {title}
        </h1>
        {state.kind === 'intro' && (
          <>
            <p>
              {state.fresh
                ? 'Start with an empty list. Accounts already saved on this device stay separate.'
                : 'Keep everything you’ve written and connect this workspace to your account.'}
            </p>
            <div className="setup-explanation">
              <p>
                <strong>A passkey to sign in.</strong>
                <span>Your browser will help you create and save it.</span>
              </p>
              <p>
                <strong>A recovery code to keep.</strong>
                <span>You’ll need it to recover your writing if you lose your devices.</span>
              </p>
            </div>
            <NameEntry
              initialName={initialName || state.requestedName}
              onChange={onName}
              button={state.fresh ? 'Create account' : 'Get started'}
              onSubmit={owner.start}
            />
            <button
              className="local-secondary"
              onClick={() => {
                leave(state.fresh ? onOtherAccount : onBack);
              }}
            >
              {state.fresh ? 'Choose an account' : 'Back to workspace'}
            </button>
          </>
        )}
        {state.kind === 'save-device-code' && (
          <>
            <p>
              Save this code somewhere safe outside this browser. It unlocks this new account’s
              writing on this device.
            </p>
            <code className="local-generated-code" aria-label="Generated device-lock code">
              {state.code}
            </code>
            <button className="setup-primary" onClick={owner.savedDeviceCode}>
              I saved my device-lock code
            </button>
          </>
        )}
        {state.kind === 'confirm-device-code' && (
          <>
            <p>Enter the code from your saved copy to create your empty workspace.</p>
            <CodeEntry
              label="Device-lock code"
              button="Confirm device-lock code"
              onSubmit={(code) => {
                void owner.confirmDeviceCode(code);
              }}
            />
          </>
        )}
        {state.kind === 'unlock' && (
          <>
            {state.accountId && <AccountIdentity id={state.accountId} />}
            <p>
              {state.returning
                ? 'Enter your device-lock code, then use your passkey to open your saved writing.'
                : 'Enter the device-lock code you saved for this workspace.'}
            </p>
            {state.returning && (
              <p className="setup-note">You can unlock on this device offline.</p>
            )}
            <CodeEntry
              label="Device-lock code"
              button={state.returning ? 'Confirm code and unlock with passkey' : 'Continue'}
              onSubmit={(code) => {
                void owner.unlock(code);
              }}
            />
            <button
              className="local-secondary"
              onClick={() => {
                leave(onOtherAccount);
              }}
            >
              Use another account
            </button>
          </>
        )}
        {state.kind === 'name' && (
          <>
            <p>Your account is unlocked. Add your name so you can recognize it when you return.</p>
            <NameEntry
              button="Continue to writing"
              onSubmit={(name) => {
                void owner.saveName(name);
              }}
            />
          </>
        )}
        {state.kind === 'passkey' && (
          <>
            <p>Use your password manager, fingerprint, face, or device PIN to sign in to done.</p>
            <button
              className="setup-primary"
              onClick={() => {
                void owner.passkey();
              }}
            >
              Create passkey
            </button>
          </>
        )}
        {state.kind === 'confirm-passkey' && (
          <>
            <p>Use the passkey you just saved so we can check that it works.</p>
            <button
              className="setup-primary"
              onClick={() => {
                void owner.passkey();
              }}
            >
              Use my passkey
            </button>
          </>
        )}
        {state.kind === 'save-recovery' && (
          <>
            <p>
              Save this code somewhere you can reach if you lose this device, such as your password
              manager.
            </p>
            <code className="local-generated-code" aria-label="Generated recovery code">
              {state.code}
            </code>
            <p className="setup-note">
              Your passkey signs you in. This code recovers your writing. You need both if you lose
              every device, and we can’t replace a lost recovery code for you.
            </p>
            <button className="setup-primary" onClick={owner.savedRecovery}>
              I saved my recovery code
            </button>
          </>
        )}
        {state.kind === 'confirm-recovery' && (
          <>
            <p>
              Enter the recovery code from the copy you saved. Your browser will also ask you to use
              your passkey to finish connecting.
            </p>
            <CodeEntry
              label="Recovery code"
              button={state.fresh ? 'Finish account setup' : 'Confirm and connect'}
              onSubmit={(code) => {
                void owner.confirmRecovery(code);
              }}
            />
            <button
              className="local-secondary"
              onClick={() => {
                void owner.restart();
              }}
            >
              I didn’t save the code — start again
            </button>
          </>
        )}
        {state.kind === 'working' && (
          <p role="status">
            {state.fresh ? 'Your accounts stay separate.' : 'Your writing stays in this workspace.'}
          </p>
        )}
        {state.fresh && !['intro', 'unlock', 'working'].includes(state.kind) && (
          <button
            className="local-secondary"
            onClick={() => {
              leave(onOtherAccount);
            }}
          >
            Choose an account
          </button>
        )}
        {'error' in state && state.error && (
          <p className="setup-error" role="alert">
            {state.error}
          </p>
        )}
        {'error' in state &&
          state.error &&
          state.kind !== 'confirm-recovery' &&
          state.kind !== 'unlock' &&
          state.kind !== 'confirm-device-code' &&
          state.kind !== 'name' && (
            <button
              className="local-secondary"
              onClick={() => {
                void owner.restart();
              }}
            >
              Start setup again
            </button>
          )}
      </section>
    </main>
  );
}
