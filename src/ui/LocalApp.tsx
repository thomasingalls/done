import { createWorkerLocalStartupRuntime } from './localStartupWorker';
import { useEffect, useRef, useState } from 'react';
import { createLocalStartup, type LocalStartup, type LocalStartupState } from './localStartup';
import type { StartupKind } from '../crdt/startupState';
import { WorkspaceUiProvider } from './workspaceUi';
import { App } from './App';
import { AppUpdateNotice } from './AppUpdateNotice';
import { LocalRecovery } from './LocalRecovery';
import { Welcome } from './Welcome';
import { WorkspaceBackdrop } from './WorkspaceBackdrop';
import { useCeremonyNavigation } from './ceremonyNavigation';
import { ProtectionFlow } from './ProtectionFlow';
import { RemoveFromDeviceButton } from './DeviceDataRemoval';
import { acknowledgeLocalRemoval } from '../crdt/deviceDataRemoval';

const messages: Record<Exclude<StartupKind, 'fresh'>, { title: string; detail: string }> = {
  'app-update-required': {
    title: 'This workspace needs a compatible app',
    detail:
      'Saved storage uses an unsupported format or has an unfinished upgrade. Reopen with the app that supports it. Your saved data has been kept.',
  },
  'unlock-required': {
    title: 'Unlock your workspace',
    detail: 'Enter your unlock code to open the writing saved in this browser.',
  },
  'creation-pending': {
    title: 'Finish creating your workspace',
    detail: 'Enter the code you saved to continue the interrupted setup.',
  },
  'unlock-failed': {
    title: 'Could not unlock',
    detail:
      'Check your unlock code and try again. If it is correct, the saved workspace may need repair.',
  },
  'migration-required': {
    title: 'Your existing writing needs migration',
    detail:
      'Keep your existing installation and verified export available. Migration must finish before this workspace can open here.',
  },
  clearing: {
    title: 'Workspace removal is unfinished',
    detail: 'Resume the existing removal procedure before opening this workspace.',
  },
  cleared: {
    title: 'This workspace was removed',
    detail: 'Its saved removal record prevents accidental recreation.',
  },
  'repair-required': {
    title: 'Your workspace needs attention',
    detail: 'Saved data is incomplete or unreadable. Keep your backups available for recovery.',
  },
  'slot-closed': {
    title: 'This workspace is closed',
    detail: 'It cannot be opened from this Local slot.',
  },
  'identity-required': {
    title: 'Workspace identity unavailable',
    detail:
      'The saved workspace could not be identified. Keep your backups available for recovery.',
  },
  busy: {
    title: 'Your workspace is busy',
    detail: 'Another operation is using this workspace. Try again after it finishes.',
  },
  unavailable: {
    title: 'Could not open your workspace',
    detail:
      'Browser storage is unavailable or setup did not finish. Try again when it is available.',
  },
  unsupported: {
    title: 'Required browser storage is unavailable',
    detail: 'Use a browser with secure storage, WebCrypto and Web Locks enabled.',
  },
  cancelled: { title: 'Workspace opening stopped', detail: 'Try again when you are ready.' },
};

const CodeForm = ({
  confirm,
  onSubmit,
}: {
  confirm: boolean;
  onSubmit: (code: string) => void;
}) => {
  const [code, setCode] = useState('');
  return (
    <form
      className="local-form"
      onSubmit={(event) => {
        event.preventDefault();
        const input = code;
        setCode('');
        onSubmit(input);
      }}
    >
      <label htmlFor="local-code">Unlock code</label>
      <input
        id="local-code"
        type="password"
        value={code}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        onChange={(event) => setCode(event.target.value)}
        required
      />
      <button type="submit">{confirm ? 'Confirm and create' : 'Unlock'}</button>
    </form>
  );
};

/** Factor-gated startup and lifecycle-owned handoff to the admitted editor. */
export const LocalApp = ({
  onConnectAccount,
  onChooseAccount,
  onCreateWorkspace,
  beginOnFresh = false,
  automaticFirstRun = true,
  onConnectExisting,
}: {
  onConnectAccount?: (name: string, code?: string) => void;
  onChooseAccount?: () => void;
  onCreateWorkspace?: () => Promise<void>;
  beginOnFresh?: boolean;
  automaticFirstRun?: boolean;
  onConnectExisting?: () => void;
} = {}): React.ReactElement => {
  const [epoch, setEpoch] = useState(0);
  const [owner, setOwner] = useState<LocalStartup | null>(null);
  const [state, setState] = useState<LocalStartupState>({ kind: 'checking' });
  const beginRequested = useRef(beginOnFresh);
  const [screen, setScreen] = useState<'sync' | 'protect' | 'protected' | null>(null);
  const syncAfterProtection = useRef(false);
  const navigation = useCeremonyNavigation({
    base: '/local',
    step: ['checking', 'working', 'closing'].includes(state.kind)
      ? null
      : state.kind === 'ready' && screen
        ? screen
        : state.kind,
    parent: state.kind === 'fresh' ? '/' : '/accounts',
    visit: (step) => {
      if (state.kind === 'ready' && step === 'ready') {
        setScreen(null);
        return true;
      }
      return owner?.visit(step) ?? false;
    },
    close: async () => {
      await owner?.close();
    },
    preserveEntry: beginOnFresh,
  });
  useEffect(() => {
    const current = createLocalStartup(automaticFirstRun, createWorkerLocalStartupRuntime);
    setOwner(current);
    setState(current.getSnapshot());
    const unsubscribe = current.subscribe(() => setState(current.getSnapshot()));
    void current.inspect().then(() => {
      if (!beginRequested.current) return;
      beginRequested.current = false;
      if (current.getSnapshot().kind === 'fresh') void current.begin();
    });
    const retire = () => {
      void current.close().catch(() => {});
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted)
        void current.close().then(
          () => setEpoch((value) => value + 1),
          () => setState({ kind: 'unavailable', reason: 'local-close-failed' }),
        );
    };
    window.addEventListener('pagehide', retire);
    window.addEventListener('pageshow', restore);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', retire);
      window.removeEventListener('pageshow', restore);
      retire();
    };
  }, [epoch, automaticFirstRun]);
  const restart = () => {
    if (!owner) return;
    void owner.close().then(
      () => setEpoch((value) => value + 1),
      () => setState({ kind: 'unavailable', reason: 'local-close-failed' }),
    );
  };
  const chooseAccount = () => {
    if (!owner || !onChooseAccount) return;
    if (navigation.enabled) {
      onChooseAccount();
      return;
    }
    void owner
      .close()
      .then(onChooseAccount, () => setState({ kind: 'unavailable', reason: 'local-close-failed' }));
  };
  let content: React.ReactNode;
  const connect = () => {
    if (!owner || state.kind !== 'ready' || !onConnectAccount) return;
    const name =
      state.workspace.read().actors.find((actor) => actor.id === state.actorId)?.name ?? 'You';
    const code = owner.takeSyncCode();
    void owner.close().then(
      () => onConnectAccount(name, code),
      () => setState({ kind: 'unavailable', reason: 'local-close-failed' }),
    );
  };
  if (navigation.leaving)
    return <p role="status">{navigation.error || 'Locking and finishing storage operations…'}</p>;
  if (state.kind === 'ready' && screen === 'protect' && owner)
    return (
      <ProtectionFlow
        forSync={syncAfterProtection.current}
        onCancel={() => {
          syncAfterProtection.current = false;
          setScreen(null);
        }}
        onConfirm={async (code) => {
          await owner.protect(code);
          if (owner.getSnapshot().kind === 'ready') setScreen('protected');
          else setScreen(null);
        }}
      />
    );
  if (state.kind === 'ready' && screen === 'sync')
    content = (
      <>
        <h1>Sync across devices</h1>
        <p>
          Keep an encrypted copy of this list with your account and use it on your other devices.
          You can still work offline.
        </p>
        <p>
          You’ll need local protection, an account passkey, and a saved recovery code. Your current
          list and notes will be kept.
        </p>
        <button
          onClick={() => {
            if (state.automatic) {
              syncAfterProtection.current = true;
              setScreen('protect');
            } else connect();
          }}
        >
          Sync this list
        </button>
        <button
          className="local-secondary"
          onClick={() => {
            if (onConnectExisting) onConnectExisting();
            else chooseAccount();
          }}
        >
          Connect an existing account
        </button>
        <p className="setup-note">Connecting an existing account keeps this local list separate.</p>
        <button className="local-secondary" onClick={() => setScreen(null)}>
          Back to Today
        </button>
      </>
    );
  else if (state.kind === 'ready' && screen === 'protected')
    content = (
      <>
        <h1>Protection is enabled</h1>
        <p>Your list and notes have been kept. Future visits require your saved unlock code.</p>
        <button
          onClick={() => {
            if (syncAfterProtection.current) connect();
            else setScreen(null);
          }}
        >
          {syncAfterProtection.current ? 'Continue to sync setup' : 'Back to Today'}
        </button>
        <button
          className="local-secondary"
          onClick={() => {
            syncAfterProtection.current = false;
            setScreen(null);
            restart();
          }}
        >
          Lock now
        </button>
        {syncAfterProtection.current && (
          <button
            className="local-secondary"
            onClick={() => {
              syncAfterProtection.current = false;
              setScreen(null);
            }}
          >
            Set up sync later
          </button>
        )}
      </>
    );
  else if (state.kind === 'checking' || state.kind === 'working' || state.kind === 'closing') {
    content = (
      <>
        <h1>
          {state.kind === 'closing'
            ? 'Locking your workspace…'
            : screen === 'protect'
              ? 'Applying protection…'
              : 'Opening your workspace…'}
        </h1>
        <p role="status">
          {state.kind === 'closing'
            ? 'Waiting for storage operations to finish.'
            : screen === 'protect'
              ? 'Verifying your protected copy. If this waits, close other tabs using this list.'
              : 'Checking encrypted storage.'}
        </p>
        {state.kind !== 'closing' && <button onClick={restart}>Cancel</button>}
      </>
    );
  } else if (state.kind === 'save-code') {
    content = (
      <>
        <h1>Save your unlock code</h1>
        <p>
          Store this code somewhere safe outside this browser. You need it to reopen your workspace.
          Losing it can mean losing access to your writing.
        </p>
        <code className="local-generated-code" aria-label="Generated unlock code">
          {state.code}
        </code>
        <button onClick={() => owner?.saved()}>I saved my code</button>
        <button className="local-secondary" onClick={restart}>
          Cancel
        </button>
      </>
    );
  } else if (state.kind === 'confirm-code') {
    content = (
      <>
        <h1>Confirm your saved code</h1>
        <p>Enter it from the copy you saved to create your encrypted workspace.</p>
        {state.error && <p role="alert">{state.error}</p>}
        <CodeForm
          confirm
          onSubmit={(code) => {
            void owner?.confirm(code);
          }}
        />
        <button className="local-secondary" onClick={restart}>
          Cancel
        </button>
      </>
    );
  } else if (state.kind === 'ready' && owner) {
    return (
      <WorkspaceUiProvider
        workspace={state.workspace}
        actorId={state.actorId}
        registerEditor={owner.registerEditor}
        onLock={restart}
        protection={state.automatic ? 'automatic' : 'protected'}
        onProtect={() => {
          syncAfterProtection.current = false;
          setScreen('protect');
        }}
        {...(onChooseAccount ? { onSwitchAccount: chooseAccount } : {})}
        {...(onConnectAccount
          ? {
              onConnectAccount: () => setScreen('sync'),
            }
          : {})}
      >
        <App />
      </WorkspaceUiProvider>
    );
  } else if (state.kind === 'fresh') {
    return (
      <Welcome
        onCreateLocal={() => owner?.begin()}
        {...(onCreateWorkspace ? { onCreateWorkspace } : {})}
        {...(onChooseAccount ? { onChooseAccount: chooseAccount } : {})}
      />
    );
  } else {
    if (state.kind === 'ready') return <div className="boot" aria-busy="true" />;
    const message = messages[state.kind];
    content = (
      <>
        <h1>
          {'reason' in state && state.reason === 'local-protection-needs-unlock-code'
            ? 'Finish enabling protection'
            : message.title}
        </h1>
        <p>
          {'reason' in state && state.reason === 'local-protection-needs-unlock-code'
            ? 'Enter your saved unlock code to finish the interrupted protection setup. Your list has been kept.'
            : message.detail}
        </p>
        {['repair-required', 'unlock-failed', 'unavailable'].includes(state.kind) && (
          <LocalRecovery />
        )}
        {['unlock-required', 'creation-pending', 'unlock-failed'].includes(state.kind) ? (
          <CodeForm
            confirm={false}
            onSubmit={(code) => {
              void owner?.unlock(code);
            }}
          />
        ) : state.kind === 'cleared' && state.reason === 'device-data-removal' ? (
          <button
            onClick={() => {
              void acknowledgeLocalRemoval('local')
                .then(restart)
                .catch(() => setState({ kind: 'unavailable', reason: 'fresh-start-failed' }));
            }}
          >
            Start fresh
          </button>
        ) : (
          <button onClick={restart}>Check again</button>
        )}
        <RemoveFromDeviceButton slotId="local" />
        {onChooseAccount && (
          <button className="local-secondary" onClick={chooseAccount}>
            Use another account
          </button>
        )}
      </>
    );
  }
  return (
    <main className="local-startup workspace-gate" data-state={state.kind}>
      <WorkspaceBackdrop />
      <div className="local-startup-panel workspace-gate-panel">
        <AppUpdateNotice />
        <span className="local-brand">done</span>
        {navigation.enabled && (
          <button className="local-secondary" onClick={navigation.back}>
            Back
          </button>
        )}
        {content}
      </div>
    </main>
  );
};
